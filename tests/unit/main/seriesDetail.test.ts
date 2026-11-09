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

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: {},
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: { get: (_key: string, fallback: unknown) => fallback },
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import {
  createTestDb,
  linkBookArtist,
  linkBookCharacter,
  linkBookGroup,
  linkBookTag,
  seedArtist,
  seedBook,
  seedCharacter,
  seedGroup,
  seedTag,
  truncateAll,
} from "../../../src/main/db/test-utils.js";
import { handleGetSeriesCollectionById } from "../../../src/main/handlers/seriesCollectionHandler.js";

let db: Knex;

const seedCollection = async () => {
  const [id] = await db("SeriesCollection").insert({
    name: "테스트 시리즈",
    is_auto_generated: false,
    is_manually_edited: true,
    confidence_score: 1,
  });
  return id;
};

describe("시리즈 상세 조회", () => {
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

  it("책의 관계 정보를 라이브러리 카드와 같은 이름 배열로 돌려준다", async () => {
    const seriesId = await seedCollection();
    const book = await seedBook(db, {
      series_collection_id: seriesId,
      series_order_index: 1,
    });
    await linkBookArtist(db, book.id, (await seedArtist(db, "작가A")).id);
    await linkBookArtist(db, book.id, (await seedArtist(db, "작가B")).id);
    await linkBookTag(db, book.id, (await seedTag(db, "female:glasses")).id);
    await linkBookGroup(db, book.id, (await seedGroup(db, "그룹A")).id);
    await linkBookCharacter(
      db,
      book.id,
      (await seedCharacter(db, "캐릭터A")).id,
    );

    const result = await handleGetSeriesCollectionById(seriesId);

    const [row] = result.data!.books;
    expect(row.artists).toEqual(
      expect.arrayContaining([{ name: "작가A" }, { name: "작가B" }]),
    );
    expect(row.tags).toEqual([{ name: "female:glasses" }]);
    expect(row.groups).toEqual([{ name: "그룹A" }]);
    expect(row.characters).toEqual([{ name: "캐릭터A" }]);
  });

  it("책을 시리즈 순서대로 돌려준다", async () => {
    const seriesId = await seedCollection();
    const second = await seedBook(db, {
      series_collection_id: seriesId,
      series_order_index: 2,
    });
    const first = await seedBook(db, {
      series_collection_id: seriesId,
      series_order_index: 1,
    });

    const result = await handleGetSeriesCollectionById(seriesId);

    expect(result.data!.books.map((book) => book.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(result.data!.book_count).toBe(2);
  });
});
