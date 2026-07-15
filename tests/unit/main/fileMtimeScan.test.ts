import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Knex } from "knex";
import archiver from "archiver";
import * as fsSync from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createTestDb, truncateAll } from "../../../src/main/db/test-utils.js";

// electron 모듈 모킹 (스캔 진행률 브로드캐스트가 창 목록을 조회함)
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

// main.ts의 커스텀 console 모킹
vi.mock("../../../src/main/main.js", () => ({
  console: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// 썸네일 생성 모킹 (sharp 워커 실행 방지)
vi.mock("../../../src/main/handlers/thumbnailHandler.js", () => ({
  generateThumbnailForBook: vi.fn(async () => null),
  handleGenerateThumbnail: vi.fn(async () => null),
}));

// 시리즈 자동 감지 모킹 (스캔 후 감지 단계 스킵)
vi.mock("../../../src/main/handlers/seriesCollectionHandler.js", () => ({
  getPrefixIndex: vi.fn(() => ({})),
  rebuildPrefixIndex: vi.fn(async () => undefined),
  handleAutoDetectSeriesForBook: vi.fn(async () => ({ matched: false })),
}));

// DB 모듈을 인메모리 DB로 교체 (getter 패턴)
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import {
  scanDirectory,
  scanFile,
} from "../../../src/main/handlers/directoryHandler.js";

let db: Knex;
let tempRoot: string;

/** 이미지 1장이 든 ZIP 파일을 생성한다 */
async function createZipWithImage(zipPath: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 0 } });
    output.on("close", () => resolvePromise());
    archive.on("error", rejectPromise);
    archive.pipe(output);
    archive.append(Buffer.from("fake-image-bytes"), { name: "001.jpg" });
    archive.finalize();
  });
}

/** 이미지 1장이 든 폴더 책을 생성한다 */
async function createFolderBook(folderPath: string): Promise<void> {
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(folderPath, "001.jpg"), "fake-image-bytes");
}

describe("파일 수정 날짜(file_mtime) 수집", () => {
  beforeAll(async () => {
    db = await createTestDb();
    dbRef.current = db;
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mtime-scan-"));
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.destroy();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  describe("scanDirectory (전체 스캔)", () => {
    it("폴더 책: 폴더 자체 mtime 저장, file_size는 null", async () => {
      const libDir = path.join(tempRoot, "lib-folder");
      const folderBook = path.join(libDir, "folder-book");
      await createFolderBook(folderBook);

      await scanDirectory(libDir);

      const stat = await fs.stat(folderBook);
      const book = await db("Book").where("path", folderBook).first();
      expect(book).toBeTruthy();
      expect(book.file_mtime).toBe(stat.mtimeMs);
      expect(book.file_size).toBeNull();
    });

    it("ZIP 책: 파일 mtime/size 저장 (기존 동작 회귀 방지)", async () => {
      const libDir = path.join(tempRoot, "lib-zip");
      await fs.mkdir(libDir, { recursive: true });
      const zipPath = path.join(libDir, "zip-book.zip");
      await createZipWithImage(zipPath);

      await scanDirectory(libDir);

      const stat = await fs.stat(zipPath);
      const book = await db("Book").where("path", zipPath).first();
      expect(book).toBeTruthy();
      expect(book.file_mtime).toBe(stat.mtimeMs);
      expect(book.file_size).toBe(stat.size);
    });
  });

  describe("scanFile (다운로드 완료·개별 재스캔)", () => {
    it("ZIP 신규 등록: file_mtime/file_size 저장", async () => {
      const zipPath = path.join(tempRoot, "single-new.zip");
      await createZipWithImage(zipPath);

      await scanFile(zipPath);

      const stat = await fs.stat(zipPath);
      const book = await db("Book").where("path", zipPath).first();
      expect(book).toBeTruthy();
      expect(book.file_mtime).toBe(stat.mtimeMs);
      expect(book.file_size).toBe(stat.size);
    });

    it("ZIP 기존 책 갱신: file_mtime/file_size가 함께 갱신됨", async () => {
      const zipPath = path.join(tempRoot, "single-update.zip");
      await createZipWithImage(zipPath);
      // 값이 비어 있는 기존 책 행을 미리 심어 갱신 경로를 태운다
      await db("Book").insert({
        title: "기존 책",
        path: zipPath,
        page_count: 1,
      });

      await scanFile(zipPath);

      const stat = await fs.stat(zipPath);
      const book = await db("Book").where("path", zipPath).first();
      expect(book.file_mtime).toBe(stat.mtimeMs);
      expect(book.file_size).toBe(stat.size);
    });

    it("폴더 책: file_mtime 저장, file_size는 null", async () => {
      const folderBook = path.join(tempRoot, "single-folder-book");
      await createFolderBook(folderBook);

      await scanFile(folderBook);

      const stat = await fs.stat(folderBook);
      const book = await db("Book").where("path", folderBook).first();
      expect(book).toBeTruthy();
      expect(book.file_mtime).toBe(stat.mtimeMs);
      expect(book.file_size).toBeNull();
    });
  });
});
