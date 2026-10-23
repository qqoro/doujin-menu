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

// configHandler가 import 시점에 new Store()를 호출하므로 mock보다 먼저 만들어 둔다
const mockStoreInstance = vi.hoisted(() => ({
  store: {},
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("electron-store", () => ({
  default: vi.fn(function () {
    return mockStoreInstance;
  }),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/mock/user/data") },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));

// 썸네일 파일 삭제는 실제 디스크에 닿지 않게 막는다
vi.mock("fs/promises", () => ({
  default: { unlink: vi.fn(), copyFile: vi.fn(), rm: vi.fn() },
  unlink: vi.fn(),
  copyFile: vi.fn(),
  rm: vi.fn(),
}));

vi.mock("../../../src/main/handlers/directoryHandler.js", () => ({
  scanDirectory: vi.fn(),
}));

vi.mock("../../../src/main/handlers/thumbnailHandler.js", () => ({
  handleGenerateThumbnail: vi.fn(),
}));

// DB 모듈을 인메모리 DB로 교체 (getter 패턴)
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
  closeDbConnection: vi.fn(),
}));

import {
  createTestDb,
  seedBook,
  seedTag,
  truncateAll,
} from "../../../src/main/db/test-utils.js";
import { handleRemoveLibraryFolder } from "../../../src/main/handlers/configHandler.js";

let db: Knex;

describe("handleRemoveLibraryFolder", () => {
  beforeAll(async () => {
    db = await createTestDb();
    dbRef.current = db;
  });

  beforeEach(async () => {
    await truncateAll(db);
    mockStoreInstance.get.mockReturnValue(["D:\\Comics", "D:\\Comics2"]);
    mockStoreInstance.set.mockClear();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("제거한 폴더의 책만 삭제하고 폴더 목록에서 뺀다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a" });
    await seedBook(db, { path: "D:\\Comics2\\b" });

    const result = await handleRemoveLibraryFolder("D:\\Comics");

    expect(result).toEqual({ success: true, folders: ["D:\\Comics2"] });
    const paths = (await db("Book").select("path")).map((row) => row.path);
    expect(paths).toEqual(["D:\\Comics2\\b"]);
  });

  it("이름 앞부분만 겹치는 이웃 폴더 책의 즐겨찾기·태그·기록을 지우지 않는다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a" });
    const neighbor = await seedBook(db, {
      path: "D:\\Comics2\\b",
      is_favorite: true,
    });
    const tag = await seedTag(db, "female:test");
    await db("BookTag").insert({ book_id: neighbor.id, tag_id: tag.id });
    await db("BookHistory").insert({ book_id: neighbor.id });

    await handleRemoveLibraryFolder("D:\\Comics");

    const kept = await db("Book").where("id", neighbor.id).first();
    expect(kept.is_favorite).toBe(1);
    expect(await db("BookTag").where("book_id", neighbor.id)).toHaveLength(1);
    expect(await db("BookHistory").where("book_id", neighbor.id)).toHaveLength(
      1,
    );
  });
});
