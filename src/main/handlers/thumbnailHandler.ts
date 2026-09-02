import { app, ipcMain } from "electron";
import fs from "fs/promises";
import os from "os"; // os 모듈 임포트
import PQueue from "p-queue"; // p-queue 임포트
import path, { dirname } from "path";
import { fileURLToPath } from "url"; // fileURLToPath 임포트
import { Worker } from "worker_threads"; // Worker 임포트
import db from "../db/index.js";
import { console } from "../main.js";
import { broadcast } from "../utils/broadcast.js";
import { isImageFile, sortImageFiles } from "../utils/imageFiles.js";
import { extractCoverFromZip } from "./directoryHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workerPool: Worker[] = [];
const availableWorkers: Worker[] = [];
const workerQueue: ((worker: Worker) => void)[] = [];

/** 워커가 죽었을 때 대기 중인 작업을 깨우기 위한 콜백. 워커별로 하나씩만 유지한다 */
const pendingRejects = new Map<Worker, (error: Error) => void>();

const workerUrl = () =>
  fileURLToPath(new URL("../workers/thumbnailWorker.js", import.meta.url));

/**
 * 워커 하나를 만들고 수명 이벤트를 붙인다.
 *
 * 교체 워커를 만들 때 이 함수를 거치지 않으면 error/exit 리스너가 없는 워커가
 * 풀에 들어가고, 그 워커가 다음에 에러를 내는 순간 처리되지 않은 'error'
 * 이벤트로 메인 프로세스가 죽는다.
 */
const spawnWorker = (): Worker => {
  const worker = new Worker(workerUrl());

  // error 뒤에는 exit이 따라오므로 정리와 교체는 exit 한 곳에서만 한다.
  // 양쪽에서 교체하면 에러 한 번에 워커가 두 개씩 늘어난다.
  worker.on("error", (err) => {
    console.error(`[Main] 썸네일 워커 오류:`, err);
    worker.terminate();
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.warn(`[Main] 썸네일 워커가 코드 ${code}로 종료되었습니다.`);
    }
    retireWorker(worker);
  });

  return worker;
};

/**
 * 죽은 워커를 풀에서 걷어내고 같은 수만큼 새로 채운다.
 *
 * 이 워커를 기다리던 호출자를 반드시 깨워야 한다. 워커가 크래시하면
 * message가 영영 오지 않으므로, 그냥 두면 호출자의 Promise가 미결로 남는다.
 */
const retireWorker = (worker: Worker) => {
  const poolIndex = workerPool.indexOf(worker);
  if (poolIndex === -1) {
    // 이미 정리된 워커 (error → terminate → exit 경로에서 중복 호출)
    return;
  }
  workerPool.splice(poolIndex, 1);

  const availableIndex = availableWorkers.indexOf(worker);
  if (availableIndex > -1) availableWorkers.splice(availableIndex, 1);

  const reject = pendingRejects.get(worker);
  pendingRejects.delete(worker);
  reject?.(new Error("썸네일 워커가 예기치 않게 종료되었습니다."));

  const replacement = spawnWorker();
  workerPool.push(replacement);
  releaseWorker(replacement);
};

/**
 * 워커 풀을 처음 쓰는 시점에 만든다.
 *
 * 앱 시작과 동시에 만들면 썸네일을 한 번도 생성하지 않는 세션에서도
 * sharp/libvips를 올린 스레드가 코어 수만큼 상주한다.
 */
const ensureWorkerPool = () => {
  if (workerPool.length > 0) return;

  const size = Math.min(4, os.cpus().length);
  for (let i = 0; i < size; i++) {
    const worker = spawnWorker();
    workerPool.push(worker);
    availableWorkers.push(worker);
  }
};

const getWorker = (): Promise<Worker> => {
  ensureWorkerPool();
  return new Promise((resolve) => {
    if (availableWorkers.length > 0) {
      const worker = availableWorkers.pop()!;
      resolve(worker);
    } else {
      workerQueue.push(resolve);
    }
  });
};

const releaseWorker = (worker: Worker) => {
  if (workerQueue.length > 0) {
    const resolveFn = workerQueue.shift()!;
    resolveFn(worker);
  } else {
    availableWorkers.push(worker);
  }
};

const thumbnailDir = path.join(app.getPath("userData"), "thumbnails");

/**
 * 특정 책 ID에 대한 썸네일을 생성하고 DB를 업데이트합니다.
 * @param bookId 썸네일을 생성할 책의 ID
 */
export async function generateThumbnailForBook(bookId: number) {
  // 1. DB에서 책 정보 조회
  const book = await db("Book").where("id", bookId).first();

  // 2. 책 정보나 경로가 없으면 중단
  if (!book || !book.path) {
    return null;
  }

  // 오프라인 책은 소스 파일에 접근할 수 없으므로 썸네일 생성 생략
  if (book.is_offline) {
    return null;
  }

  let sourcePath: string | null = null;
  const ext = path.extname(book.path).toLowerCase();

  try {
    // 3. 책 경로 유형에 따라 썸네일 소스 이미지 경로를 결정
    if (
      await fs
        .stat(book.path)
        .then((stat) => stat.isDirectory())
        .catch(() => false)
    ) {
      // 3-1. 폴더인 경우: 뷰어와 같은 순서로 세운 뒤 첫 페이지를 소스로 사용
      const imageFiles = sortImageFiles(await fs.readdir(book.path));
      if (imageFiles.length > 0) {
        sourcePath = path.join(book.path, imageFiles[0]);
      }
    } else if (ext === ".cbz" || ext === ".zip") {
      // 3-2. ZIP/CBZ 파일인 경우: 압축을 풀어 커버 이미지를 임시 폴더에 저장 후 사용
      await fs.mkdir(path.join(app.getPath("userData"), "temp_cover"), {
        recursive: true,
      });
      const tempCoverPath = path.join(
        app.getPath("userData"),
        "temp_cover",
        `${book.id}_temp_cover.webp`,
      );
      sourcePath = await extractCoverFromZip(book.path, tempCoverPath);
    } else if (isImageFile(book.path)) {
      // 3-3. 단일 이미지 파일인 경우: 해당 파일을 직접 소스로 사용
      sourcePath = book.path;
    }

    // 4. 소스 이미지를 찾지 못하면 오류 처리 후 중단
    if (!sourcePath) {
      console.error(
        `[Main] Could not determine source image for bookId: ${bookId}, path: ${book.path}`,
      );
      return null;
    }

    // 5. 최종 썸네일이 저장될 경로 설정
    const thumbnailPath = path.join(thumbnailDir, `${bookId}.webp`);

    // 워커 스레드 풀에서 워커를 가져와 썸네일 생성 작업 위임
    const worker = await getWorker();
    const hash = await new Promise<string | undefined>((resolve, reject) => {
      // 6. 워커로부터 작업 완료/실패 메시지를 수신하는 일회성 핸들러
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandler = (msg: any) => {
        pendingRejects.delete(worker);
        worker.off("message", messageHandler);
        // 7. 워커를 먼저 풀에 반환해야 reject 이후에도 다음 작업이 이어진다
        releaseWorker(worker);

        if (msg.status === "success") {
          resolve(msg.hash);
        } else {
          console.error(
            `[Main] Worker failed for bookId: ${msg.bookId}, error: ${msg.error}`,
          );
          reject(new Error(msg.error));
        }
      };

      // 워커가 크래시하면 message가 오지 않는다. retireWorker가 이 콜백으로
      // 깨워주지 않으면 이 Promise는 영원히 미결로 남는다.
      pendingRejects.set(worker, (error) => {
        worker.off("message", messageHandler);
        reject(error);
      });

      worker.on("message", messageHandler);

      // 8. 워커에게 썸네일 생성에 필요한 정보를 전달하며 작업을 시작시킴
      worker.postMessage({
        sourcePath,
        thumbnailPath,
        bookId,
        tempPath: app.getPath("temp"),
        thumbnailDirPath: thumbnailDir,
      });
    });

    return { bookId, thumbnailPath, hash }; // 썸네일 경로와 표지 해시 반환
  } catch (error) {
    // 9. 전체 썸네일 생성 과정에서 발생한 예외를 처리
    console.error(
      `[Main] Failed to generate thumbnail for book ${bookId} from path ${book.path}:`,
      error,
    );
    return null;
  }
}

export const handleGenerateThumbnail = async (bookId: number) => {
  const result = await generateThumbnailForBook(bookId);
  if (result) {
    await db("Book")
      .where("id", result.bookId)
      .update({ cover_path: result.thumbnailPath, cover_hash: result.hash });
  }
};

export const handleRegenerateAllThumbnails = async () => {
  global.console.time("handleRegenerateAllThumbnails >>>>>>>>>");
  try {
    const books = await db("Book").select("id");

    const queue = new PQueue({ concurrency: os.cpus().length });
    const updatedThumbnails: {
      bookId: number;
      thumbnailPath: string;
      hash?: string;
    }[] = [];

    for (const book of books) {
      queue.add(async () => {
        const result = await generateThumbnailForBook(book.id);
        if (result) {
          updatedThumbnails.push(result);
        }
      });
    }

    await queue.onIdle(); // 큐의 모든 작업이 완료될 때까지 기다림

    // 모든 썸네일 생성이 완료된 후, 단일 트랜잭션으로 DB 업데이트
    await db.transaction(async (trx) => {
      for (const { bookId, thumbnailPath, hash } of updatedThumbnails) {
        await trx("Book")
          .where("id", bookId)
          .update({ cover_path: thumbnailPath, cover_hash: hash });
      }
    });

    broadcast("books-updated"); // UI 갱신

    global.console.timeEnd("handleRegenerateAllThumbnails >>>>>>>>>");
    return { success: true, count: books.length };
  } catch (error) {
    console.error("[Main] Failed during thumbnail regeneration:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * 진행 중인 백필. 창이 여럿이거나 페이지를 빠르게 드나들면 요청이 겹치는데,
 * 그때마다 새로 돌리면 같은 책을 여러 번 해시한다. 이미 돌고 있으면 그
 * 작업에 합류시킨다.
 */
let backfillInFlight: Promise<number> | null = null;

/** 워커에게 해시만 요청한다. 실패해도 백필 전체를 멈추지 않는다 */
const hashWithWorker = async (
  bookId: number,
  imagePath: string,
): Promise<string | null> => {
  const worker = await getWorker();
  return new Promise<string | null>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = (msg: any) => {
      pendingRejects.delete(worker);
      worker.off("message", messageHandler);
      releaseWorker(worker);
      resolve(msg.status === "success" ? (msg.hash ?? null) : null);
    };

    // 워커가 크래시하면 message가 오지 않는다. 이 콜백이 없으면 영원히 미결이다
    pendingRejects.set(worker, () => {
      worker.off("message", messageHandler);
      resolve(null);
    });

    worker.on("message", messageHandler);
    worker.postMessage({
      mode: "hash",
      sourcePath: imagePath,
      thumbnailPath: "",
      bookId,
      tempPath: app.getPath("temp"),
      thumbnailDirPath: thumbnailDir,
    });
  });
};

const runCoverHashBackfill = async (): Promise<number> => {
  const rows: { id: number }[] = await db("Book")
    .select("id")
    .whereNull("cover_hash")
    .orderBy("id");

  // 썸네일 파일이 있는 책만 대상이다. 없으면 해시를 만들 소스가 없다.
  // 오프라인 책도 포함된다 — 썸네일은 userData에 있어 원본이 빠져도 읽힌다
  const pending: { id: number; thumbnailPath: string }[] = [];
  for (const row of rows) {
    const thumbnailPath = path.join(thumbnailDir, `${row.id}.webp`);
    const exists = await fs
      .stat(thumbnailPath)
      .then(() => true)
      .catch(() => false);
    if (exists) pending.push({ id: row.id, thumbnailPath });
  }

  if (pending.length === 0) return 0;

  const queue = new PQueue({ concurrency: os.cpus().length });
  const hashed: { id: number; hash: string }[] = [];
  let done = 0;

  for (const item of pending) {
    queue.add(async () => {
      const hash = await hashWithWorker(item.id, item.thumbnailPath);
      if (hash) hashed.push({ id: item.id, hash });
      done++;
      broadcast("cover-hash-progress", {
        total: pending.length,
        current: done,
      });
    });
  }
  await queue.onIdle();

  await db.transaction(async (trx) => {
    for (const { id, hash } of hashed) {
      await trx("Book").where("id", id).update({ cover_hash: hash });
    }
  });

  return hashed.length;
};

export const handleBackfillCoverHashes = async () => {
  if (!backfillInFlight) {
    backfillInFlight = runCoverHashBackfill().finally(() => {
      backfillInFlight = null;
    });
  }

  try {
    return { success: true, hashedCount: await backfillInFlight };
  } catch (error) {
    console.error("[Main] 표지 해시 백필 실패:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * 썸네일 관련 IPC 핸들러를 등록합니다.
 */
export function registerThumbnailHandlers() {
  // 워커 풀은 getWorker()에서 첫 요청 때 만든다.

  ipcMain.handle("generate-thumbnail", (_event, bookId) =>
    handleGenerateThumbnail(bookId),
  );
  ipcMain.handle("regenerate-all-thumbnails", (_event) =>
    handleRegenerateAllThumbnails(),
  );
  ipcMain.handle("backfill-cover-hashes", () => handleBackfillCoverHashes());
}
