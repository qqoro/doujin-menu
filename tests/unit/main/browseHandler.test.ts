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

const addBook = async (
  title: string,
  options: { addedAt?: string; coverPath?: string | null } = {},
) => {
  const [id] = await db("Book").insert({
    title,
    path: `C:\\books\\${title}`,
    added_at: options.addedAt ?? new Date().toISOString(),
    cover_path:
      options.coverPath === undefined
        ? `C:\\thumbs\\${title}.webp`
        : options.coverPath,
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

    expect(result.map(({ name, count }) => ({ name, count }))).toStrictEqual([
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
    const cover_path = "C:\\thumbs\\책C.webp";
    expect(await handleGetSeriesWithCount()).toStrictEqual([
      { name: "시리즈1", count: 1, cover_path },
    ]);
    expect(await handleGetGroupsWithCount()).toStrictEqual([
      { name: "그룹1", count: 1, cover_path },
    ]);
    expect(await handleGetCharactersWithCount()).toStrictEqual([
      { name: "캐릭터1", count: 1, cover_path },
    ]);
  });
});

describe("browseHandler 대표 표지", () => {
  it("가장 최근에 추가한 책의 표지를 고른다", async () => {
    const old = await addBook("옛책", { addedAt: "2026-01-01T00:00:00.000Z" });
    const recent = await addBook("새책", {
      addedAt: "2026-05-01T00:00:00.000Z",
    });
    await link("BookArtist", "Artist", old, "작가", "artist_id");
    await link("BookArtist", "Artist", recent, "작가", "artist_id");

    expect(await handleGetArtistsWithCount()).toStrictEqual([
      { name: "작가", count: 2, cover_path: "C:\\thumbs\\새책.webp" },
    ]);
  });

  it("추가 시각이 같으면 id가 큰 책을 고른다", async () => {
    const addedAt = "2026-05-01T00:00:00.000Z";
    const first = await addBook("먼저", { addedAt });
    const second = await addBook("나중", { addedAt });
    await link("BookArtist", "Artist", second, "작가", "artist_id");
    await link("BookArtist", "Artist", first, "작가", "artist_id");

    const [row] = await handleGetArtistsWithCount();

    expect(row.cover_path).toBe("C:\\thumbs\\나중.webp");
  });

  it("최신 책에 표지가 없으면 표지가 있는 그다음 책을 고른다", async () => {
    const old = await addBook("옛책", { addedAt: "2026-01-01T00:00:00.000Z" });
    const noCover = await addBook("표지없음", {
      addedAt: "2026-05-01T00:00:00.000Z",
      coverPath: null,
    });
    await link("BookArtist", "Artist", old, "작가", "artist_id");
    await link("BookArtist", "Artist", noCover, "작가", "artist_id");

    const [row] = await handleGetArtistsWithCount();

    expect(row.cover_path).toBe("C:\\thumbs\\옛책.webp");
  });

  it("표지가 있는 책이 하나도 없으면 null이다", async () => {
    const book = await addBook("표지없음", { coverPath: null });
    await link("BookArtist", "Artist", book, "작가", "artist_id");

    expect(await handleGetArtistsWithCount()).toStrictEqual([
      { name: "작가", count: 1, cover_path: null },
    ]);
  });

  it("대표 표지는 이름마다 따로 고른다", async () => {
    const a = await addBook("A책", { addedAt: "2026-01-01T00:00:00.000Z" });
    const b = await addBook("B책", { addedAt: "2026-05-01T00:00:00.000Z" });
    await link("BookGroup", "Group", a, "그룹A", "group_id");
    await link("BookGroup", "Group", b, "그룹B", "group_id");

    expect(await handleGetGroupsWithCount()).toStrictEqual([
      { name: "그룹A", count: 1, cover_path: "C:\\thumbs\\A책.webp" },
      { name: "그룹B", count: 1, cover_path: "C:\\thumbs\\B책.webp" },
    ]);
  });
});
