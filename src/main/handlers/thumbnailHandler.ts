import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs/promises";
import os from "os"; // os 모듈 임포트
import PQueue from "p-queue"; // p-queue 임포트
import path, { dirname } from "path";
import { fileURLToPath } from "url"; // fileURLToPath 임포트
import { Worker } from "worker_threads"; // Worker 임포트
import db from "../db/index.js";
import { console } from "../main.js";
import { extractCoverFromZip } from "./directoryHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workerPool: Worker[] = [];
const availableWorkers: Worker[] = [];
const workerQueue: ((worker: Worker) => void)[] = [];

const initializeWorkerPool = () => {
  const numCpus = os.cpus().length;
  console.log(`[Main] Initializing worker pool with ${numCpus} workers.`);
  for (let i = 0; i < numCpus; i++) {
    const worker = new Worker(
      fileURLToPath(new URL("../workers/thumbnailWorker.js", import.meta.url)),
    );
    workerPool.push(worker);
    availableWorkers.push(worker);

    // 워커에서 메시지를 받으면 (작업 완료 등) 처리
    worker.on("message", () => {
      // 이 부분은 generateThumbnailForBook 내의 Promise에서 처리될 것임
    });

    // 워커 에러 처리
    worker.on("error", (err) => {
      console.error(`[Main] Worker pool error:`, err);
      // 에러 발생 시 해당 워커를 풀에서 제거하고 새 워커로 교체하는 로직 추가 가능
      const index = workerPool.indexOf(worker);
      if (index > -1) workerPool.splice(index, 1);
      const availableIndex = availableWorkers.indexOf(worker);
      if (availableIndex > -1) availableWorkers.splice(availableIndex, 1);
      worker.terminate();
      // 새 워커 생성 (선택 사항: 풀 크기 유지)
      const newWorker = new Worker(
        fileURLToPath(
          new URL("../workers/thumbnailWorker.js", import.meta.url),
        ),
      );
      workerPool.push(newWorker);
      availableWorkers.push(newWorker);
    });

    // 워커 종료 처리
    worker.on("exit", (code) => {
      console.warn(`[Main] Worker exited with code ${code}.`);
      // 비정상 종료 시 풀에서 제거하고 새 워커로 교체
      const index = workerPool.indexOf(worker);
      if (index > -1) workerPool.splice(index, 1);
      const availableIndex = availableWorkers.indexOf(worker);
      if (availableIndex > -1) availableWorkers.splice(availableIndex, 1);
      if (code !== 0) {
        const newWorker = new Worker(
          fileURLToPath(
            new URL("../workers/thumbnailWorker.js", import.meta.url),
          ),
        );
        workerPool.push(newWorker);
        availableWorkers.push(newWorker);
      }
    });
  }
};

const getWorker = (): Promise<Worker> => {
  return new Promise((resolve) => {
    if (availableWorkers.length > 0) {
      const worker = availableWorkers.pop()!;
      console.log(
        `[Main] Worker acquired. Available: ${availableWorkers.length}`,
      );
      resolve(worker);
    } else {
      console.log(
        `[Main] No available workers. Queueing request. Queue size: ${workerQueue.length + 1}`,
      );
      workerQueue.push(resolve);
    }
  });
};

const releaseWorker = (worker: Worker) => {
  if (workerQueue.length > 0) {
    const resolveFn = workerQueue.shift()!;
    console.log(
      `[Main] Worker released to queued request. Queue size: ${workerQueue.length}`,
    );
    resolveFn(worker);
  } else {
    availableWorkers.push(worker);
    console.log(
      `[Main] Worker returned to pool. Available: ${availableWorkers.length}`,
    );
  }
};

const thumbnailDir = path.join(app.getPath("userData"), "thumbnails");

/**
 * 특정 책 ID에 대한 썸네일을 생성하고 DB를 업데이트합니다.
 * @param bookId 썸네일을 생성할 책의 ID
 */
export async function generateThumbnailForBook(bookId: number) {
  const book = await db("Book").where("id", bookId).first();
  console.log(
    `[Main] Generating thumbnail for bookId: ${bookId}, path: ${book?.path}`,
  );

  if (!book || !book.path) {
    console.log(`[Main] Book not found or path missing for bookId: ${bookId}`);
    return null;
  }

  let sourcePath: string | null = null;
  const ext = path.extname(book.path).toLowerCase();

  try {
    if (
      await fs
        .stat(book.path)
        .then((stat) => stat.isDirectory())
        .catch(() => false)
    ) {
      console.log(`[Main] Book path is a directory: ${book.path}`);
      const imageFiles = (await fs.readdir(book.path))
        .filter((f) => f.match(/\.(jpg|jpeg|png|webp)$/i))
        .sort();
      if (imageFiles.length > 0) {
        sourcePath = path.join(book.path, imageFiles[0]);
        console.log(`[Main] Found image file in directory: ${sourcePath}`);
      }
    } else if (ext === ".cbz" || ext === ".zip") {
      console.log(`[Main] Book path is a ZIP file: ${book.path}`);
      const tempCoverPath = path.join(
        app.getPath("temp"),
        `${book.id}_temp_cover.webp`,
      );
      sourcePath = await extractCoverFromZip(book.path, tempCoverPath);
      if (sourcePath) {
        console.log(`[Main] Extracted cover from ZIP to: ${sourcePath}`);
      } else {
        console.log(`[Main] Failed to extract cover from ZIP: ${book.path}`);
      }
    } else if (ext.match(/\.(jpg|jpeg|png|webp)$/i)) {
      console.log(`[Main] Book path is an image file: ${book.path}`);
      sourcePath = book.path;
    }

    if (!sourcePath) {
      console.error(
        `[Main] Could not determine source image for bookId: ${bookId}, path: ${book.path}`,
      );
      return null;
    }

    const thumbnailPath = path.join(thumbnailDir, `${bookId}.webp`);

    // 워커 스레드 풀에서 워커를 가져와 썸네일 생성 작업 위임
    const worker = await getWorker();
    await new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandler = (msg: any) => {
        if (msg.status === "success") {
          console.log(
            `[Main] Thumbnail generated by worker for bookId: ${msg.bookId}`,
          );
          resolve();
        } else {
          console.error(
            `[Main] Worker failed for bookId: ${msg.bookId}, error: ${msg.error}`,
          );
          reject(new Error(msg.error));
        }
        worker.off("message", messageHandler);
        releaseWorker(worker);
      };

      worker.on("message", messageHandler);

      worker.postMessage({
        sourcePath,
        thumbnailPath,
        bookId,
        tempPath: app.getPath("temp"),
        thumbnailDirPath: thumbnailDir,
      });
    });

    return { bookId, thumbnailPath }; // 썸네일 경로 반환
  } catch (error) {
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
      .update({ cover_path: result.thumbnailPath });
  }
};

export const handleRegenerateAllThumbnails = async () => {
  console.log("[Main] Regenerating all thumbnails.");
  global.console.time("handleRegenerateAllThumbnails >>>>>>>>>");
  try {
    const books = await db("Book").select("id");
    console.log(`[Main] Found ${books.length} books to process.`);

    const queue = new PQueue({ concurrency: os.cpus().length });
    const updatedThumbnails: { bookId: number; thumbnailPath: string }[] = [];

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
      for (const { bookId, thumbnailPath } of updatedThumbnails) {
        await trx("Book")
          .where("id", bookId)
          .update({ cover_path: thumbnailPath });
      }
    });

    console.log("[Main] Finished regenerating all thumbnails.");
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("books-updated"); // UI 갱신
    });

    global.console.timeEnd("handleRegenerateAllThumbnails >>>>>>>>>");
    return { success: true, count: books.length };
  } catch (error) {
    console.error("[Main] Failed during thumbnail regeneration:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * 썸네일 관련 IPC 핸들러를 등록합니다.
 */
export function registerThumbnailHandlers() {
  initializeWorkerPool(); // 워커 풀 초기화

  ipcMain.handle("generate-thumbnail", (_event, bookId) =>
    handleGenerateThumbnail(bookId),
  );
  ipcMain.handle("regenerate-all-thumbnails", (_event) =>
    handleRegenerateAllThumbnails(),
  );
}
