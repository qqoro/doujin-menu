import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Knex } from "knex";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  cleanupMissingBooks,
  isPathAccessible,
  markBooksOfflineUnderPath,
  restoreBooksOnlineUnderPath,
  scanDirectory,
} from "../../../src/main/handlers/directoryHandler.js";

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: {},
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

import { BrowserWindow } from "electron";

// console mock (main.ts에서 export)
vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// 썸네일 핸들러 mock (워커 스레드 실행 방지)
vi.mock("../../../src/main/handlers/thumbnailHandler.js", () => ({
  generateThumbnailForBook: vi.fn(async () => null),
  handleGenerateThumbnail: vi.fn(async () => ({ success: true })),
}));

// 시리즈 감지 핸들러 mock (워커 스레드 실행 방지)
vi.mock("../../../src/main/handlers/seriesCollectionHandler.js", () => ({
  getPrefixIndex: vi.fn(() => ({})), // truthy 반환 → rebuild 생략
  handleAutoDetectSeriesForBook: vi.fn(async () => ({ matched: false })),
  rebuildPrefixIndex: vi.fn(async () => {}),
}));

// DB 모듈을 인메모리 DB로 교체 (getter 패턴)
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import {
  createTestDb,
  truncateAll,
  seedBook,
} from "../../../src/main/db/test-utils.js";

let db: Knex;

describe("오프라인 라이브러리 보존", () => {
  beforeAll(async () => {
    db = await createTestDb();
    dbRef.current = db;
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe("마이그레이션", () => {
    it("Book 테이블에 is_offline 컬럼이 기본값 0으로 존재해야 함", async () => {
      const book = await seedBook(db, { path: "C:\\lib\\book1" });
      expect(book.is_offline).toBe(0);
    });
  });

  describe("isPathAccessible", () => {
    it("존재하는 폴더는 true", async () => {
      expect(await isPathAccessible(os.tmpdir())).toBe(true);
    });

    it("존재하지 않는 폴더는 false", async () => {
      expect(await isPathAccessible("Z:\\존재하지않는\\폴더\\경로")).toBe(
        false,
      );
    });
  });

  describe("markBooksOfflineUnderPath", () => {
    it("해당 경로 하위 책만 오프라인 처리하고 개수를 반환", async () => {
      await seedBook(db, { path: "C:\\extlib\\book1" });
      await seedBook(db, { path: "C:\\extlib\\book2" });
      await seedBook(db, { path: "D:\\other\\book3" });

      const count = await markBooksOfflineUnderPath("C:\\extlib");

      expect(count).toBe(2);
      const offline = await db("Book").where("is_offline", true);
      expect(offline).toHaveLength(2);
      const other = await db("Book").where("path", "D:\\other\\book3").first();
      expect(other.is_offline).toBe(0);
    });
  });

  describe("restoreBooksOnlineUnderPath", () => {
    it("해당 경로 하위의 오프라인 책을 온라인으로 복귀", async () => {
      await seedBook(db, { path: "C:\\extlib\\book1", is_offline: true });
      await seedBook(db, { path: "D:\\other\\book2", is_offline: true });

      await restoreBooksOnlineUnderPath("C:\\extlib");

      const book1 = await db("Book").where("path", "C:\\extlib\\book1").first();
      const book2 = await db("Book").where("path", "D:\\other\\book2").first();
      expect(book1.is_offline).toBe(0);
      expect(book2.is_offline).toBe(1); // 다른 경로는 영향 없음
    });
  });

  describe("scanDirectory — 루트 접근 불가 가드", () => {
    it("루트가 없으면 삭제하지 않고 전부 오프라인 마킹 후 조기 반환", async () => {
      const missingRoot = "Z:\\분리된외장하드\\library";
      await seedBook(db, { path: `${missingRoot}\\book1` });
      await seedBook(db, { path: `${missingRoot}\\book2` });

      const result = await scanDirectory(missingRoot);

      expect(result.offline).toBe(true);
      expect(result.offlineCount).toBe(2);
      expect(result.deleted).toBe(0);
      const books = await db("Book").select("*");
      expect(books).toHaveLength(2); // 삭제되지 않음
      expect(books.every((b) => b.is_offline === 1)).toBe(true);
    });
  });

  describe("scanDirectory — 루트 접근 가능 시 온라인 복귀", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "offline-test-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("디스크에 존재하는 오프라인 책은 온라인으로 복귀하고 삭제되지 않음", async () => {
      // 실제 책 폴더 생성 (이미지 1장)
      const bookDir = path.join(tmpDir, "book1");
      await fs.mkdir(bookDir);
      await fs.writeFile(path.join(bookDir, "001.jpg"), "fake-image");

      await seedBook(db, { path: bookDir, is_offline: true });

      const result = await scanDirectory(tmpDir);

      expect(result.offline).toBeFalsy();
      expect(result.deleted).toBe(0);
      const book = await db("Book").where("path", bookDir).first();
      expect(book).toBeDefined();
      expect(book.is_offline).toBe(0); // 온라인 복귀
    });

    it("루트는 정상인데 디스크에 없는 책은 기존처럼 삭제됨", async () => {
      const bookDir = path.join(tmpDir, "book1");
      await fs.mkdir(bookDir);
      await fs.writeFile(path.join(bookDir, "001.jpg"), "fake-image");

      await seedBook(db, { path: bookDir });
      await seedBook(db, { path: path.join(tmpDir, "지워진책") }); // 디스크에 없음

      const result = await scanDirectory(tmpDir);

      expect(result.deleted).toBe(1);
      const books = await db("Book").select("*");
      expect(books).toHaveLength(1);
      expect(books[0].path).toBe(bookDir);
    });
  });

  describe("오프라인/온라인 전환 시 UI 즉시 갱신 브로드캐스트", () => {
    // 가짜 렌더러 창: webContents.send 호출 여부로 브로드캐스트 검증
    let sendSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sendSpy = vi.fn();
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
        { webContents: { send: sendSpy } } as unknown as Electron.BrowserWindow,
      ]);
    });

    afterEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([]);
    });

    it("오프라인 마킹 시 books-updated를 브로드캐스트", async () => {
      await seedBook(db, { path: "C:\\extlib\\book1" });

      await markBooksOfflineUnderPath("C:\\extlib");

      expect(sendSpy).toHaveBeenCalledWith("books-updated");
    });

    it("온라인 복귀 시 books-updated를 브로드캐스트", async () => {
      await seedBook(db, { path: "C:\\extlib\\book1", is_offline: true });

      await restoreBooksOnlineUnderPath("C:\\extlib");

      expect(sendSpy).toHaveBeenCalledWith("books-updated");
    });

    it("변경된 책이 없으면 브로드캐스트하지 않음", async () => {
      await markBooksOfflineUnderPath("C:\\빈경로");
      await restoreBooksOnlineUnderPath("C:\\빈경로");

      expect(sendSpy).not.toHaveBeenCalledWith("books-updated");
    });
  });

  describe("cleanupMissingBooks — 삭제 직전 재확인", () => {
    it("루트가 접근 가능하면 미발견 책을 삭제", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-test-"));
      try {
        await seedBook(db, { path: path.join(tmpDir, "남는책") });
        await seedBook(db, { path: path.join(tmpDir, "지워진책") });

        const found = new Set([path.join(tmpDir, "남는책")]);
        const result = await cleanupMissingBooks(tmpDir, found);

        expect(result.offline).toBe(false);
        expect(result.deleted).toBe(1);
        const books = await db("Book").select("*");
        expect(books).toHaveLength(1);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("루트가 접근 불가면(스캔 도중 분리) 삭제를 건너뛰고 오프라인 마킹", async () => {
      const missingRoot = "Z:\\스캔도중분리됨";
      await seedBook(db, { path: `${missingRoot}\\book1` });

      const result = await cleanupMissingBooks(missingRoot, new Set());

      expect(result.offline).toBe(true);
      expect(result.deleted).toBe(0);
      const book = await db("Book").first();
      expect(book.is_offline).toBe(1);
    });
  });
});
