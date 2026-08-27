import type { Knex } from "knex";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import { createTestDb } from "../../../src/main/db/test-utils.js";
import {
  handleGetArtistsWithCount,
  handleGetCharactersWithCount,
  handleGetGroupsWithCount,
  handleGetSeriesWithCount,
  handleGetTagsWithCount,
} from "../../../src/main/handlers/browseHandler.js";

let db: Knex;

const addBook = async (title: string) => {
  const [id] = await db("Book").insert({
    title,
    path: `C:\\books\\${title}`,
    added_at: new Date().toISOString(),
  });
  return id as number;
};

const link = async (
  table: string,
  nameTable: string,
  bookId: number,
  name: string,
  column: string,
) => {
  let row = await db(nameTable).where("name", name).first();
  if (!row) {
    const [id] = await db(nameTable).insert({ name });
    row = { id };
  }
  await db(table).insert({ book_id: bookId, [column]: row.id });
};

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  for (const table of [
    "BookArtist",
    "BookTag",
    "BookSeries",
    "BookGroup",
    "BookCharacter",
    "Book",
    "Artist",
    "Tag",
    "Series",
    "Group",
    "Character",
  ]) {
    await db(table).delete();
  }
});

describe("browseHandler 집계", () => {
  it("작가별 책 수를 세고 이름순으로 정렬한다", async () => {
    const a = await addBook("책A");
    const b = await addBook("책B");
    await link("BookArtist", "Artist", a, "나작가", "artist_id");
    await link("BookArtist", "Artist", b, "나작가", "artist_id");
    await link("BookArtist", "Artist", a, "가작가", "artist_id");

    const result = await handleGetArtistsWithCount();

    expect(result).toStrictEqual([
      { name: "가작가", count: 1 },
      { name: "나작가", count: 2 },
    ]);
  });

  it("연결된 책이 없는 이름은 목록에 나오지 않는다", async () => {
    await db("Artist").insert({ name: "고아작가" });

    expect(await handleGetArtistsWithCount()).toStrictEqual([]);
  });

  it("태그·시리즈·그룹·캐릭터도 같은 모양으로 센다", async () => {
    const book = await addBook("책C");
    await link("BookTag", "Tag", book, "태그1", "tag_id");
    await link("BookSeries", "Series", book, "시리즈1", "series_id");
    await link("BookGroup", "Group", book, "그룹1", "group_id");
    await link("BookCharacter", "Character", book, "캐릭터1", "character_id");

    expect(await handleGetTagsWithCount()).toStrictEqual([
      { name: "태그1", count: 1 },
    ]);
    expect(await handleGetSeriesWithCount()).toStrictEqual([
      { name: "시리즈1", count: 1 },
    ]);
    expect(await handleGetGroupsWithCount()).toStrictEqual([
      { name: "그룹1", count: 1 },
    ]);
    expect(await handleGetCharactersWithCount()).toStrictEqual([
      { name: "캐릭터1", count: 1 },
    ]);
  });
});
