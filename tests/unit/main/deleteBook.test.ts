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
import fs from "fs/promises";
import os from "os";
import path from "path";

// electron 모듈 모킹 (shell.trashItem 검증용)
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

import { shell } from "electron";

// console mock (main.ts에서 export)
vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// configHandler mock (ElectronStore 초기화 방지)
vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: { get: vi.fn() },
}));

// DB 모듈을 인메모리 DB로 교체 (getter 패턴)
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import { handleDeleteBook } from "../../../src/main/handlers/bookHandler.js";
import {
  createTestDb,
  truncateAll,
  seedBook,
} from "../../../src/main/db/test-utils.js";

const mockTrashItem = vi.mocked(shell.trashItem);

let db: Knex;

// 실제 임시 파일 생성 헬퍼 (영구 삭제 경로 검증용)
async function createTempFile(): Promise<string> {
  const filePath = path.join(
    os.tmpdir(),
    `comiq-test-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
  );
  await fs.writeFile(filePath, "dummy");
  return filePath;
}

describe("handleDeleteBook 휴지통 기본화", () => {
  beforeAll(async () => {
    db = await createTestDb();
    dbRef.current = db;
  });

  beforeEach(async () => {
    await truncateAll(db);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("기본 호출 시 shell.trashItem으로 휴지통 이동하고 DB 레코드를 삭제", async () => {
    const filePath = await createTempFile();
    const book = await seedBook(db, { title: "휴지통 테스트", path: filePath });
    mockTrashItem.mockResolvedValue(undefined);

    const result = await handleDeleteBook(book.id as number);

    expect(result.success).toBe(true);
    expect(mockTrashItem).toHaveBeenCalledWith(filePath);
    expect(await db("Book").where("id", book.id).first()).toBeUndefined();

    // trashItem이 mock이라 실제 파일이 남으므로 정리
    await fs.rm(filePath, { force: true });
  });

  it("permanent: true 시 휴지통을 거치지 않고 파일을 영구 삭제", async () => {
    const filePath = await createTempFile();
    const book = await seedBook(db, {
      title: "영구 삭제 테스트",
      path: filePath,
    });

    const result = await handleDeleteBook(book.id as number, {
      permanent: true,
    });

    expect(result.success).toBe(true);
    expect(mockTrashItem).not.toHaveBeenCalled();
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await db("Book").where("id", book.id).first()).toBeUndefined();
  });

  it("휴지통 이동 실패 시 DB 레코드를 보존하고 실패 반환", async () => {
    const filePath = await createTempFile();
    const book = await seedBook(db, {
      title: "이동 실패 테스트",
      path: filePath,
    });
    mockTrashItem.mockRejectedValue(new Error("trash unavailable"));

    const result = await handleDeleteBook(book.id as number);

    expect(result.success).toBe(false);
    expect(await db("Book").where("id", book.id).first()).toBeDefined();

    await fs.rm(filePath, { force: true });
  });

  it("파일이 이미 없으면(ENOENT) 휴지통 호출 없이 DB만 삭제", async () => {
    const book = await seedBook(db, {
      title: "파일 없음 테스트",
      path: path.join(os.tmpdir(), "comiq-not-exists-xyz.zip"),
    });

    const result = await handleDeleteBook(book.id as number);

    expect(result.success).toBe(true);
    expect(mockTrashItem).not.toHaveBeenCalled();
    expect(await db("Book").where("id", book.id).first()).toBeUndefined();
  });

  it("permanent 삭제 실패(비-ENOENT) 시 DB 레코드를 보존하고 실패 반환", async () => {
    const filePath = await createTempFile();
    const book = await seedBook(db, {
      title: "영구 실패 테스트",
      path: filePath,
    });
    const unlinkSpy = vi
      .spyOn(fs, "unlink")
      .mockRejectedValueOnce(
        Object.assign(new Error("EPERM"), { code: "EPERM" }),
      );

    const result = await handleDeleteBook(book.id as number, {
      permanent: true,
    });

    // 파일 삭제 실패 시 파일과 DB가 함께 유지되어야 일관성이 보장된다
    expect(result.success).toBe(false);
    expect(result.error).toBe("파일을 영구 삭제하지 못했습니다.");
    expect(await db("Book").where("id", book.id).first()).toBeDefined();

    unlinkSpy.mockRestore();
    await fs.rm(filePath, { force: true });
  });

  it("연관 테이블(BookHistory 등) 레코드도 함께 삭제", async () => {
    const book = await seedBook(db, {
      title: "연관 삭제 테스트",
      path: path.join(os.tmpdir(), "comiq-not-exists-rel.zip"),
    });
    await db("BookHistory").insert({
      book_id: book.id,
      viewed_at: new Date().toISOString(),
    });

    const result = await handleDeleteBook(book.id as number);

    expect(result.success).toBe(true);
    expect(await db("BookHistory").where("book_id", book.id)).toHaveLength(0);
  });
});
