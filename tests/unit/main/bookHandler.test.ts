import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Knex } from "knex";

describe("bookHandler", () => {
  describe("createKoreanRegexp", () => {
    // 한국어 제목 추출 정규식 테스트
    const createKoreanRegexp = () => /^.+\|\s?(.+)$/;

    it("'영어 | 한글' 형식에서 한글 부분을 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "English Title | 한글 제목";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글 제목");
    });

    it("'영어|한글' 형식 (공백 없음)에서도 한글 부분을 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "English Title|한글제목";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글제목");
    });

    it("파이프가 없는 제목은 매칭되지 않아야 함", () => {
      const regex = createKoreanRegexp();
      const title = "Only English Title";
      const match = regex.exec(title);

      expect(match).toBeNull();
    });

    it("파이프만 있고 뒤에 텍스트가 없으면 매칭되지 않음", () => {
      const regex = createKoreanRegexp();
      const title = "English Title |";
      const match = regex.exec(title);

      // 정규식 /^.+\|\s?(.+)$/는 파이프 뒤에 최소 1개 이상의 문자가 필요함
      expect(match).toBeNull();
    });

    it("파이프가 여러 개 있으면 마지막 파이프 이후를 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "Part1 | Part2 | 한글제목";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글제목");
    });

    it("한글 부분에 공백이 있어도 제대로 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "English | 한글 제목 테스트";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글 제목 테스트");
    });
  });

  describe("검색 쿼리 파싱 로직", () => {
    // 검색 쿼리 파싱 정규식
    const prefixedTermRegex =
      /(id|artist|group|type|language|series|character|tag):(.+?)(?=\s*(?:id|artist|group|type|language|series|character|tag|male|female):|$)/g;

    it("'artist:작가명' 형식을 올바르게 파싱해야 함", () => {
      const query = "artist:작가1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가1");
    });

    it("'tag:태그명' 형식을 올바르게 파싱해야 함", () => {
      const query = "tag:태그1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("tag");
      expect(matches[0][2]).toBe("태그1");
    });

    it("여러 프리픽스를 포함한 쿼리를 파싱해야 함", () => {
      const query = "artist:작가1 tag:태그1 type:만화";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(3);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가1");
      expect(matches[1][1]).toBe("tag");
      expect(matches[1][2]).toBe("태그1");
      expect(matches[2][1]).toBe("type");
      expect(matches[2][2]).toBe("만화");
    });

    it("'id:123' 형식을 올바르게 파싱해야 함", () => {
      const query = "id:12345";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("id");
      expect(matches[0][2]).toBe("12345");
    });

    it("'series:시리즈명' 형식을 올바르게 파싱해야 함", () => {
      const query = "series:시리즈1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("series");
      expect(matches[0][2]).toBe("시리즈1");
    });

    it("'group:그룹명' 형식을 올바르게 파싱해야 함", () => {
      const query = "group:그룹1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("group");
      expect(matches[0][2]).toBe("그룹1");
    });

    it("'character:캐릭터명' 형식을 올바르게 파싱해야 함", () => {
      const query = "character:캐릭터1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("character");
      expect(matches[0][2]).toBe("캐릭터1");
    });

    it("'language:언어명' 형식을 올바르게 파싱해야 함", () => {
      const query = "language:korean";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("language");
      expect(matches[0][2]).toBe("korean");
    });

    it("프리픽스 없는 텍스트는 매칭되지 않아야 함", () => {
      const query = "일반 검색어";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(0);
    });

    it("프리픽스와 일반 텍스트가 섞인 쿼리를 파싱해야 함", () => {
      const query = "일반검색 artist:작가1 태그검색";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("artist");
      // 정규식은 다음 프리픽스나 문자열 끝까지 매칭하므로 "작가1 태그검색"이 됨
      expect(matches[0][2]).toBe("작가1 태그검색");
    });

    it("공백 없이 연속된 프리픽스를 파싱해야 함", () => {
      const query = "artist:작가1tag:태그1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가1");
      expect(matches[1][1]).toBe("tag");
      expect(matches[1][2]).toBe("태그1");
    });

    it("프리픽스 값에 공백이 포함되어도 다음 프리픽스 전까지 파싱해야 함", () => {
      const query = "artist:작가 이름 tag:태그1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가 이름");
      expect(matches[1][1]).toBe("tag");
      expect(matches[1][2]).toBe("태그1");
    });
  });

  describe("male/female 태그 파싱", () => {
    it("'male:태그' 형식을 인식해야 함", () => {
      const term = "male:근육";
      expect(term.startsWith("male:")).toBe(true);
      expect(term.split(":")[1]).toBe("근육");
    });

    it("'female:태그' 형식을 인식해야 함", () => {
      const term = "female:안경";
      expect(term.startsWith("female:")).toBe(true);
      expect(term.split(":")[1]).toBe("안경");
    });

    it("일반 태그는 male/female로 시작하지 않아야 함", () => {
      const term = "일반태그";
      expect(term.startsWith("male:")).toBe(false);
      expect(term.startsWith("female:")).toBe(false);
    });
  });

  describe("제목 변환 로직 (prioritizeKoreanTitles)", () => {
    const createKoreanRegexp = () => /^.+\|\s?(.+)$/;

    it("prioritizeKoreanTitles가 활성화되면 한글 부분만 반환해야 함", () => {
      const title = "English Title | 한글 제목";
      const prioritizeKoreanTitles = true;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("한글 제목");
    });

    it("prioritizeKoreanTitles가 비활성화되면 원본 제목을 유지해야 함", () => {
      const title = "English Title | 한글 제목";
      const prioritizeKoreanTitles = false;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("English Title | 한글 제목");
    });

    it("파이프가 없는 제목은 그대로 유지해야 함", () => {
      const title = "Only English Title";
      const prioritizeKoreanTitles = true;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("Only English Title");
    });

    it("한글 부분에 공백이 있으면 trim 처리되어야 함", () => {
      const title = "English |  한글 제목  ";
      const prioritizeKoreanTitles = true;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("한글 제목");
    });
  });
});

// ========== 통합 테스트: buildFilteredQuery (실제 인메모리 DB) ==========

import {
  createTestDb,
  truncateAll,
  seedBook,
  seedArtist,
  seedTag,
  seedSeries,
  seedGroup,
  seedCharacter,
  linkBookArtist,
  linkBookTag,
  linkBookSeries,
  linkBookGroup,
  linkBookCharacter,
} from "../../../src/main/db/test-utils.js";

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn() },
  shell: {},
}));

// console mock (main.ts에서 export)
vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn() },
}));

// configHandler mock
vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: { get: vi.fn() },
}));

let db: Knex;

// buildFilteredQuery 로직 재현 (bookHandler.ts와 동일)
function buildFilteredQuery(db: Knex, filter: any) {
  const {
    searchQuery = "",
    readStatus = "all",
    isFavorite = false,
    libraryPath = "",
  } = filter || {};

  const subquery = db("Book")
    .select(
      "Book.*",
      db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
      db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
      db.raw("GROUP_CONCAT(DISTINCT Series.name) as series"),
      db.raw("GROUP_CONCAT(DISTINCT `Group`.name) as groups"),
      db.raw("GROUP_CONCAT(DISTINCT `Character`.name) as characters"),
    )
    .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
    .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
    .leftJoin("BookTag", "Book.id", "BookTag.book_id")
    .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
    .leftJoin("BookSeries", "Book.id", "BookSeries.book_id")
    .leftJoin("Series", "BookSeries.series_id", "Series.id")
    .leftJoin("BookGroup", "Book.id", "BookGroup.book_id")
    .leftJoin("Group", "BookGroup.group_id", "Group.id")
    .leftJoin("BookCharacter", "Book.id", "BookCharacter.book_id")
    .leftJoin("Character", "BookCharacter.character_id", "Character.id")
    .groupBy("Book.id");

  const mainQuery = db(subquery.as("sub"));

  if (libraryPath && libraryPath !== "all") {
    mainQuery.where("sub.path", "like", `${libraryPath}%`);
  }

  if (searchQuery) {
    const lowerCaseQuery = searchQuery.toLowerCase();
    const titleTerms: string[] = [];
    const idTerms: string[] = [];
    const artistTerms: string[] = [];
    const tagTerms: string[] = [];
    const seriesTerms: string[] = [];
    const groupTerms: string[] = [];
    const typeTerms: string[] = [];
    const languageTerms: string[] = [];
    const characterTerms: string[] = [];

    const prefixedTermRegex =
      /(id|artist|group|type|language|series|character|tag):(.+?)(?=\s*(?:id|artist|group|type|language|series|character|tag|male|female):|$)/g;

    let lastIndex = 0;
    let match;

    while ((match = prefixedTermRegex.exec(lowerCaseQuery)) !== null) {
      const prefix = match[1];
      const value = match[2].trim();

      const leadingText = lowerCaseQuery.substring(lastIndex, match.index).trim();
      if (leadingText) {
        titleTerms.push(...leadingText.split(" ").filter((t) => t.length > 0));
      }

      switch (prefix) {
        case "id":
          idTerms.push(value);
          break;
        case "artist":
          artistTerms.push(value);
          break;
        case "group":
          groupTerms.push(value);
          break;
        case "type":
          typeTerms.push(value);
          break;
        case "language":
          languageTerms.push(value);
          break;
        case "series":
          seriesTerms.push(value);
          break;
        case "character":
          characterTerms.push(value);
          break;
        case "tag":
          tagTerms.push(value);
          break;
      }
      lastIndex = prefixedTermRegex.lastIndex;
    }

    const remainingText = lowerCaseQuery.substring(lastIndex).trim();
    if (remainingText) {
      titleTerms.push(...remainingText.split(" ").filter((t) => t.length > 0));
    }

    const unhandledTerms = [...titleTerms];
    titleTerms.length = 0;
    for (const term of unhandledTerms) {
      if (term.startsWith("male:") || term.startsWith("female:")) {
        tagTerms.push(term);
      } else {
        titleTerms.push(term);
      }
    }

    if (idTerms.length > 0) {
      mainQuery.whereIn("sub.hitomi_id", idTerms);
    }
    if (artistTerms.length > 0) {
      for (const artist of artistTerms) {
        mainQuery.whereRaw("LOWER(sub.artists) LIKE ?", [`%${artist}%`]);
      }
    }
    if (groupTerms.length > 0) {
      for (const group of groupTerms) {
        mainQuery.whereRaw("LOWER(sub.groups) LIKE ?", [`%${group}%`]);
      }
    }
    if (typeTerms.length > 0) {
      for (const type of typeTerms) {
        mainQuery.whereRaw("LOWER(sub.type) LIKE ?", [`%${type}%`]);
      }
    }
    if (languageTerms.length > 0) {
      for (const language of languageTerms) {
        mainQuery.whereRaw(
          "LOWER(sub.language_name_english) LIKE ? OR LOWER(sub.language_name_local) LIKE ?",
          [`%${language}%`, `%${language}%`],
        );
      }
    }
    if (characterTerms.length > 0) {
      for (const character of characterTerms) {
        mainQuery.whereRaw("LOWER(sub.characters) LIKE ?", [`%${character}%`]);
      }
    }
    if (tagTerms.length > 0) {
      for (const tag of tagTerms) {
        mainQuery.whereRaw("LOWER(sub.tags) LIKE ?", [`%${tag}%`]);
      }
    }
    if (seriesTerms.length > 0) {
      for (const seriesName of seriesTerms) {
        mainQuery.whereRaw("LOWER(sub.series) LIKE ?", [`%${seriesName}%`]);
      }
    }
    if (titleTerms.length > 0) {
      for (const titleTerm of titleTerms) {
        mainQuery.whereRaw("LOWER(sub.title) LIKE ?", [`%${titleTerm}%`]);
      }
    }
  }

  if (readStatus === "read") {
    mainQuery.whereNotNull("sub.last_read_at");
  } else if (readStatus === "unread") {
    mainQuery.whereNull("sub.last_read_at");
  }

  if (isFavorite) {
    mainQuery.where("sub.is_favorite", true);
  }

  return mainQuery;
}

async function getResultIds(query: Knex.QueryBuilder): Promise<number[]> {
  const results = await query.select("sub.id");
  return results.map((r: any) => r.id).sort();
}

describe("buildFilteredQuery - 실제 DB 통합 테스트", () => {
  beforeAll(async () => {
    db = await createTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe("기본 필터 (검색어 없음)", () => {
    it("필터 없으면 모든 책을 반환", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const ids = await getResultIds(buildFilteredQuery(db, null));
      expect(ids).toHaveLength(3);
    });

    it("readStatus=read: 읽은 책만", async () => {
      await seedBook(db, { path: "/a", last_read_at: new Date("2024-01-01") });
      await seedBook(db, { path: "/b", last_read_at: null });

      const ids = await getResultIds(buildFilteredQuery(db, { readStatus: "read" }));
      expect(ids).toHaveLength(1);
    });

    it("readStatus=unread: 안 읽은 책만", async () => {
      await seedBook(db, { path: "/a", last_read_at: new Date("2024-01-01") });
      await seedBook(db, { path: "/b", last_read_at: null });
      await seedBook(db, { path: "/c", last_read_at: null });

      const ids = await getResultIds(buildFilteredQuery(db, { readStatus: "unread" }));
      expect(ids).toHaveLength(2);
    });

    it("isFavorite=true: 즐겨찾기만", async () => {
      await seedBook(db, { path: "/a", is_favorite: true });
      await seedBook(db, { path: "/b", is_favorite: false });

      const ids = await getResultIds(buildFilteredQuery(db, { isFavorite: true }));
      expect(ids).toHaveLength(1);
    });
  });

  describe("hitomi_id 검색", () => {
    it("id:12345 → 해당 책만 매칭", async () => {
      await seedBook(db, { path: "/a", hitomi_id: "12345" });
      await seedBook(db, { path: "/b", hitomi_id: "67890" });

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "id:12345" }));
      expect(ids).toHaveLength(1);
    });
  });

  describe("type 검색", () => {
    it("type:doujinshi → 해당 타입만", async () => {
      await seedBook(db, { path: "/a", type: "doujinshi" });
      await seedBook(db, { path: "/b", type: "manga" });

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "type:doujinshi" }));
      expect(ids).toHaveLength(1);
    });
  });

  describe("language 검색", () => {
    it("language:korean → 한국어 책만", async () => {
      await seedBook(db, { path: "/a", language_name_english: "korean", language_name_local: "한국어" });
      await seedBook(db, { path: "/b", language_name_english: "japanese", language_name_local: "日本語" });

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "language:korean" }));
      expect(ids).toHaveLength(1);
    });
  });

  describe("제목 검색", () => {
    it("일반 검색어 → 제목 LIKE 검색", async () => {
      await seedBook(db, { path: "/a", title: "테스트 도서 1" });
      await seedBook(db, { path: "/b", title: "다른 책" });

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "테스트" }));
      expect(ids).toHaveLength(1);
    });
  });

  describe("GROUP_CONCAT + LIKE 부분일치 버그 확인", () => {
    it("artist:abc → 'abc'만 매칭되어야 하지만 'xabc'도 매칭됨 (버그)", async () => {
      const artist1 = await seedArtist(db, "abc");
      const artist2 = await seedArtist(db, "xabc");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, book1.id, artist1.id);
      await linkBookArtist(db, book2.id, artist2.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "artist:abc" }));

      // 의도: [book1.id] (abc만), 실제: [book1.id, book2.id] (xabc도 매칭)
      // 리팩토링 후 이 테스트를 [book1.id]로 수정하면 됨
      expect(ids).toEqual([book1.id, book2.id].sort());
    });

    it("tag:nurse → 'nurse'만 매칭되어야 하지만 'unnurse'도 매칭됨 (버그)", async () => {
      const tag1 = await seedTag(db, "nurse");
      const tag2 = await seedTag(db, "unnurse");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookTag(db, book1.id, tag1.id);
      await linkBookTag(db, book2.id, tag2.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "tag:nurse" }));

      expect(ids).toEqual([book1.id, book2.id].sort());
    });

    it("series:series1 → 'series1'만 매칭되어야 하지만 'xseries1'도 매칭됨 (버그)", async () => {
      const series1 = await seedSeries(db, "series1");
      const series2 = await seedSeries(db, "xseries1");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookSeries(db, book1.id, series1.id);
      await linkBookSeries(db, book2.id, series2.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "series:series1" }));

      expect(ids).toEqual([book1.id, book2.id].sort());
    });

    it("group:group1 → 'group1'만 매칭되어야 하지만 'xgroup1'도 매칭됨 (버그)", async () => {
      const group1 = await seedGroup(db, "group1");
      const group2 = await seedGroup(db, "xgroup1");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookGroup(db, book1.id, group1.id);
      await linkBookGroup(db, book2.id, group2.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "group:group1" }));

      expect(ids).toEqual([book1.id, book2.id].sort());
    });

    it("character:char1 → 'char1'만 매칭되어야 하지만 'xchar1'도 매칭됨 (버그)", async () => {
      const char1 = await seedCharacter(db, "char1");
      const char2 = await seedCharacter(db, "xchar1");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookCharacter(db, book1.id, char1.id);
      await linkBookCharacter(db, book2.id, char2.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "character:char1" }));

      expect(ids).toEqual([book1.id, book2.id].sort());
    });
  });

  describe("다중 관계 — 한 책에 여러 artist/tag", () => {
    it("한 책에 artist 2명 → 둘 중 하나로 검색 시 매칭", async () => {
      const artist1 = await seedArtist(db, "artist_a");
      const artist2 = await seedArtist(db, "artist_b");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book1.id, artist1.id);
      await linkBookArtist(db, book1.id, artist2.id);

      const idsA = await getResultIds(buildFilteredQuery(db, { searchQuery: "artist:artist_a" }));
      const idsB = await getResultIds(buildFilteredQuery(db, { searchQuery: "artist:artist_b" }));

      expect(idsA).toEqual([book1.id]);
      expect(idsB).toEqual([book1.id]);
    });

    it("한 책에 tag 3개 → 하나로 검색 시 매칭", async () => {
      const tag1 = await seedTag(db, "tag_x");
      const tag2 = await seedTag(db, "tag_y");
      const tag3 = await seedTag(db, "tag_z");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book1.id, tag1.id);
      await linkBookTag(db, book1.id, tag2.id);
      await linkBookTag(db, book1.id, tag3.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "tag:tag_y" }));
      expect(ids).toEqual([book1.id]);
    });
  });

  describe("관계 없는 책", () => {
    it("artist/tag 없는 책은 artist 검색에 걸리지 않음", async () => {
      const artist1 = await seedArtist(db, "solo_artist");
      const bookWithArtist = await seedBook(db, { path: "/a" });
      const bookNoArtist = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, bookWithArtist.id, artist1.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "artist:solo_artist" }));
      expect(ids).toEqual([bookWithArtist.id]);
    });

    it("tag 없는 책은 tag 검색에 걸리지 않음", async () => {
      const tag1 = await seedTag(db, "solo_tag");
      const bookWithTag = await seedBook(db, { path: "/a" });
      const bookNoTag = await seedBook(db, { path: "/b" });
      await linkBookTag(db, bookWithTag.id, tag1.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "tag:solo_tag" }));
      expect(ids).toEqual([bookWithTag.id]);
    });
  });

  describe("대소문자 무시", () => {
    it("artist:ABC → 'abc' 아티스트 매칭", async () => {
      const artist1 = await seedArtist(db, "abc");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book1.id, artist1.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "artist:ABC" }));
      expect(ids).toEqual([book1.id]);
    });

    it("TYPE:DOUJINSHI → 소문자 type 매칭", async () => {
      await seedBook(db, { path: "/a", type: "doujinshi" });

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "type:DOUJINSHI" }));
      expect(ids).toHaveLength(1);
    });
  });

  describe("동일 프리픽스 다중 조건 (AND)", () => {
    it("artist:a artist:b → 두 아티스트 모두 있는 책만", async () => {
      const artistA = await seedArtist(db, "alpha");
      const artistB = await seedArtist(db, "beta");
      const artistC = await seedArtist(db, "gamma");
      const book1 = await seedBook(db, { path: "/a" }); // alpha + beta
      const book2 = await seedBook(db, { path: "/b" }); // alpha만
      const book3 = await seedBook(db, { path: "/c" }); // beta만
      await linkBookArtist(db, book1.id, artistA.id);
      await linkBookArtist(db, book1.id, artistB.id);
      await linkBookArtist(db, book2.id, artistA.id);
      await linkBookArtist(db, book3.id, artistB.id);
      // book4: gamma만
      const book4 = await seedBook(db, { path: "/d" });
      await linkBookArtist(db, book4.id, artistC.id);

      const ids = await getResultIds(
        buildFilteredQuery(db, { searchQuery: "artist:alpha artist:beta" }),
      );
      expect(ids).toEqual([book1.id]);
    });
  });

  describe("male/female 태그", () => {
    it("male:근육 → tags에서 검색", async () => {
      const tag1 = await seedTag(db, "male:근육");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "male:근육" }));
      expect(ids).toEqual([book1.id]);
    });

    it("female:안경 → tags에서 검색", async () => {
      const tag1 = await seedTag(db, "female:안경");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "female:안경" }));
      expect(ids).toEqual([book1.id]);
    });
  });

  describe("프리픽스 + 일반 검색어 혼합", () => {
    it("'검색어 artist:abc' → 제목에 '검색어' + artist에 'abc'인 책", async () => {
      const artist1 = await seedArtist(db, "abc");
      const book1 = await seedBook(db, { path: "/a", title: "검색어 포함 제목" });
      const book2 = await seedBook(db, { path: "/b", title: "검색어 포함 제목" });
      const book3 = await seedBook(db, { path: "/c", title: "다른 제목" });
      await linkBookArtist(db, book1.id, artist1.id);
      await linkBookArtist(db, book2.id, artist1.id);

      // book1: 제목에 '검색어' 있고 artist abc ✓
      // book2: 제목에 '검색어' 있고 artist abc ✓
      // book3: 제목에 '검색어' 없음 ✗
      const ids = await getResultIds(
        buildFilteredQuery(db, { searchQuery: "검색어 artist:abc" }),
      );
      expect(ids).toEqual([book1.id, book2.id].sort());
    });
  });

  describe("검색 결과 없음", () => {
    it("존재하지 않는 artist → 빈 결과", async () => {
      const artist1 = await seedArtist(db, "real_artist");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book1.id, artist1.id);

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "artist:nonexistent" }));
      expect(ids).toHaveLength(0);
    });

    it("존재하지 않는 제목 → 빈 결과", async () => {
      await seedBook(db, { path: "/a", title: "테스트 도서" });

      const ids = await getResultIds(buildFilteredQuery(db, { searchQuery: "절대없는제목" }));
      expect(ids).toHaveLength(0);
    });
  });

  describe("libraryPath 필터", () => {
    it("libraryPath 지정 → path LIKE 필터", async () => {
      await seedBook(db, { path: "/library/a/book1" });
      await seedBook(db, { path: "/library/b/book2" });

      const ids = await getResultIds(
        buildFilteredQuery(db, { libraryPath: "/library/a" }),
      );
      expect(ids).toHaveLength(1);
    });

    it("libraryPath=all → 전체 조회", async () => {
      await seedBook(db, { path: "/library/a/book1" });
      await seedBook(db, { path: "/library/b/book2" });

      const ids = await getResultIds(buildFilteredQuery(db, { libraryPath: "all" }));
      expect(ids).toHaveLength(2);
    });
  });

  describe("필터 조합", () => {
    it("검색어 + readStatus + isFavorite 조합", async () => {
      await seedBook(db, {
        path: "/a",
        title: "테스트",
        is_favorite: true,
        last_read_at: new Date("2024-01-01"),
      });
      await seedBook(db, {
        path: "/b",
        title: "테스트",
        is_favorite: true,
        last_read_at: null,
      });
      await seedBook(db, {
        path: "/c",
        title: "테스트",
        is_favorite: false,
        last_read_at: new Date("2024-01-01"),
      });

      // title에 '테스트' + 읽음 + 즐겨찾기
      const ids = await getResultIds(
        buildFilteredQuery(db, {
          searchQuery: "테스트",
          readStatus: "read",
          isFavorite: true,
        }),
      );
      // book1만 모든 조건 만족
      const book1 = await db("Book").where("path", "/a").first();
      expect(ids).toEqual([book1.id]);
    });
  });
});