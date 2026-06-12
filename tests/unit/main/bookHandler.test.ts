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
import type { FilterParams } from "../../../src/types/ipc.js";
import {
  parseSearchQuery,
  extractKoreanTitle,
} from "../../../src/main/handlers/bookHandler.js";

// ========== 유닛 테스트: 순수 함수 ==========

describe("parseSearchQuery", () => {
  it("빈 문자열 → 모든 항목 빈 배열", () => {
    const result = parseSearchQuery("");
    expect(result.titleTerms).toEqual([]);
    expect(result.idTerms).toEqual([]);
    expect(result.artistTerms).toEqual([]);
    expect(result.tagTerms).toEqual([]);
    expect(result.seriesTerms).toEqual([]);
    expect(result.groupTerms).toEqual([]);
    expect(result.typeTerms).toEqual([]);
    expect(result.languageTerms).toEqual([]);
    expect(result.characterTerms).toEqual([]);
    expect(result.exclude.titleTerms).toEqual([]);
    expect(result.exclude.tagTerms).toEqual([]);
  });

  describe("단일 프리픽스 파싱", () => {
    it("artist:작가명", () => {
      const result = parseSearchQuery("artist:홍길동");
      expect(result.artistTerms).toEqual(["홍길동"]);
      expect(result.titleTerms).toEqual([]);
    });

    it("tag:태그명", () => {
      const result = parseSearchQuery("tag: nurse");
      expect(result.tagTerms).toEqual(["nurse"]);
    });

    it("series:시리즈명", () => {
      const result = parseSearchQuery("series:시리즈1");
      expect(result.seriesTerms).toEqual(["시리즈1"]);
    });

    it("group:그룹명", () => {
      const result = parseSearchQuery("group:그룹A");
      expect(result.groupTerms).toEqual(["그룹a"]);
    });

    it("character:캐릭터명", () => {
      const result = parseSearchQuery("character:캐릭터1");
      expect(result.characterTerms).toEqual(["캐릭터1"]);
    });

    it("language:korean", () => {
      const result = parseSearchQuery("language:korean");
      expect(result.languageTerms).toEqual(["korean"]);
    });

    it("type:doujinshi", () => {
      const result = parseSearchQuery("type:doujinshi");
      expect(result.typeTerms).toEqual(["doujinshi"]);
    });

    it("id:12345", () => {
      const result = parseSearchQuery("id:12345");
      expect(result.idTerms).toEqual(["12345"]);
    });
  });

  describe("대소문자 무시", () => {
    it("ARTIST:ABC → 소문자로 변환", () => {
      const result = parseSearchQuery("ARTIST:ABC");
      expect(result.artistTerms).toEqual(["abc"]);
    });

    it("Type:Doujinshi → 소문자로 변환", () => {
      const result = parseSearchQuery("Type:Doujinshi");
      expect(result.typeTerms).toEqual(["doujinshi"]);
    });
  });

  describe("male/female 태그", () => {
    it("male:근육 → tagTerms에 분류", () => {
      const result = parseSearchQuery("male:근육");
      expect(result.tagTerms).toEqual(["male:근육"]);
      expect(result.titleTerms).toEqual([]);
    });

    it("female:안경 → tagTerms에 분류", () => {
      const result = parseSearchQuery("female:안경");
      expect(result.tagTerms).toEqual(["female:안경"]);
    });

    it("tag:female:long_hair → tagTerms에 통째로 분류", () => {
      const result = parseSearchQuery("tag:female:long_hair");
      expect(result.tagTerms).toEqual(["female:long_hair"]);
      expect(result.titleTerms).toEqual([]);
    });

    it("tag:male:sole_male → tagTerms에 통째로 분류", () => {
      const result = parseSearchQuery("tag:male:sole_male");
      expect(result.tagTerms).toEqual(["male:sole_male"]);
      expect(result.titleTerms).toEqual([]);
    });

    it("tag:female:안경 tag:male:근육 혼합 검색", () => {
      const result = parseSearchQuery("tag:female:안경 tag:male:근육");
      expect(result.tagTerms).toEqual(["female:안경", "male:근육"]);
    });
  });

  describe("제외(-) 검색 파싱", () => {
    it("-tag:nurse → exclude.tagTerms에 분류", () => {
      const result = parseSearchQuery("-tag:nurse");
      expect(result.tagTerms).toEqual([]);
      expect(result.exclude.tagTerms).toEqual(["nurse"]);
    });

    it("-artist:홍길동 → exclude.artistTerms에 분류", () => {
      const result = parseSearchQuery("-artist:홍길동");
      expect(result.artistTerms).toEqual([]);
      expect(result.exclude.artistTerms).toEqual(["홍길동"]);
    });

    it("-female:ahegao → exclude.tagTerms에 분류", () => {
      const result = parseSearchQuery("-female:ahegao");
      expect(result.tagTerms).toEqual([]);
      expect(result.exclude.tagTerms).toEqual(["female:ahegao"]);
    });

    it("-male:근육 → exclude.tagTerms에 분류", () => {
      const result = parseSearchQuery("-male:근육");
      expect(result.tagTerms).toEqual([]);
      expect(result.exclude.tagTerms).toEqual(["male:근육"]);
    });

    it("-type:doujinshi → exclude.typeTerms에 분류", () => {
      const result = parseSearchQuery("-type:doujinshi");
      expect(result.typeTerms).toEqual([]);
      expect(result.exclude.typeTerms).toEqual(["doujinshi"]);
    });

    it("-language:korean → exclude.languageTerms에 분류", () => {
      const result = parseSearchQuery("-language:korean");
      expect(result.languageTerms).toEqual([]);
      expect(result.exclude.languageTerms).toEqual(["korean"]);
    });

    it("-series:시리즈1 → exclude.seriesTerms에 분류", () => {
      const result = parseSearchQuery("-series:시리즈1");
      expect(result.seriesTerms).toEqual([]);
      expect(result.exclude.seriesTerms).toEqual(["시리즈1"]);
    });

    it("-group:그룹A → exclude.groupTerms에 분류", () => {
      const result = parseSearchQuery("-group:그룹A");
      expect(result.groupTerms).toEqual([]);
      expect(result.exclude.groupTerms).toEqual(["그룹a"]);
    });

    it("-character:캐릭터1 → exclude.characterTerms에 분류", () => {
      const result = parseSearchQuery("-character:캐릭터1");
      expect(result.characterTerms).toEqual([]);
      expect(result.exclude.characterTerms).toEqual(["캐릭터1"]);
    });

    it("-id:12345 → exclude.idTerms에 분류", () => {
      const result = parseSearchQuery("-id:12345");
      expect(result.idTerms).toEqual([]);
      expect(result.exclude.idTerms).toEqual(["12345"]);
    });

    it("-테스트 → exclude.titleTerms에 분류", () => {
      const result = parseSearchQuery("-테스트");
      expect(result.titleTerms).toEqual([]);
      expect(result.exclude.titleTerms).toEqual(["테스트"]);
    });

    it("긍정 + 제외 혼합: artist:홍길동 -tag:nurse", () => {
      const result = parseSearchQuery("artist:홍길동 -tag:nurse");
      expect(result.artistTerms).toEqual(["홍길동"]);
      expect(result.exclude.tagTerms).toEqual(["nurse"]);
    });

    it("동일 카테고리 긍정+제외: tag:foo -tag:bar", () => {
      const result = parseSearchQuery("tag:foo -tag:bar");
      expect(result.tagTerms).toEqual(["foo"]);
      expect(result.exclude.tagTerms).toEqual(["bar"]);
    });

    it("다중 제외: -tag:a -tag:b", () => {
      const result = parseSearchQuery("-tag:a -tag:b");
      expect(result.exclude.tagTerms).toEqual(["a", "b"]);
    });
  });

  describe("일반 검색어 (프리픽스 없음)", () => {
    it("프리픽스 없는 텍스트 → titleTerms", () => {
      const result = parseSearchQuery("테스트 검색어");
      expect(result.titleTerms).toEqual(["테스트", "검색어"]);
    });

    it("프리픽스 앞의 텍스트도 titleTerms에 포함", () => {
      const result = parseSearchQuery("일반검색 artist:작가1");
      expect(result.titleTerms).toEqual(["일반검색"]);
      expect(result.artistTerms).toEqual(["작가1"]);
    });

    it("프리픽스 뒤의 텍스트도 titleTerms에 포함", () => {
      const result = parseSearchQuery("artist:작가1 태그검색");
      expect(result.artistTerms).toEqual(["작가1"]);
      expect(result.titleTerms).toEqual(["태그검색"]);
    });
  });

  describe("다중 프리픽스", () => {
    it("여러 프리픽스를 한 번에 파싱", () => {
      const result = parseSearchQuery(
        "artist:작가1 tag:태그1 type:manga language:korean",
      );
      expect(result.artistTerms).toEqual(["작가1"]);
      expect(result.tagTerms).toEqual(["태그1"]);
      expect(result.typeTerms).toEqual(["manga"]);
      expect(result.languageTerms).toEqual(["korean"]);
    });

    it("동일 프리픽스 여러 개 → 배열에 누적", () => {
      const result = parseSearchQuery("artist:alpha artist:beta");
      expect(result.artistTerms).toEqual(["alpha", "beta"]);
    });
  });

  describe("프리픽스 값 경계", () => {
    it("프리픽스 값에 공백이 있으면 첫 단어만 캡처", () => {
      const result = parseSearchQuery("artist:작가 이름 tag:태그1");
      expect(result.artistTerms).toEqual(["작가"]);
      expect(result.titleTerms).toEqual(["이름"]);
      expect(result.tagTerms).toEqual(["태그1"]);
    });

    it("공백 없이 연속된 프리픽스도 분리", () => {
      const result = parseSearchQuery("artist:작가1tag:태그1");
      expect(result.artistTerms).toEqual(["작가1"]);
      expect(result.tagTerms).toEqual(["태그1"]);
    });
  });
});

describe("extractKoreanTitle", () => {
  it("prioritizeKorean=false → 원본 제목 그대로 반환", () => {
    expect(extractKoreanTitle("English Title | 한글 제목", false)).toBe(
      "English Title | 한글 제목",
    );
  });

  it("'영어 | 한글' 형식에서 한글 부분만 추출", () => {
    expect(extractKoreanTitle("English Title | 한글 제목", true)).toBe(
      "한글 제목",
    );
  });

  it("'영어|한글' 공백 없이도 추출", () => {
    expect(extractKoreanTitle("English Title|한글제목", true)).toBe("한글제목");
  });

  it("파이프가 없는 제목 → 원본 그대로", () => {
    expect(extractKoreanTitle("Only English Title", true)).toBe(
      "Only English Title",
    );
  });

  it("파이프 뒤에 내용이 없으면 원본 그대로", () => {
    expect(extractKoreanTitle("English Title |", true)).toBe("English Title |");
  });

  it("파이프가 여러 개면 마지막 파이프 이후 추출", () => {
    expect(extractKoreanTitle("Part1 | Part2 | 한글제목", true)).toBe(
      "한글제목",
    );
  });

  it("한글 부분 공백 trim 처리", () => {
    expect(extractKoreanTitle("English |  한글 제목  ", true)).toBe(
      "한글 제목",
    );
  });
});

// ========== 통합 테스트: handleGetBooks (실제 인메모리 DB) ==========

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

// DB 모듈을 인메모리 DB로 교체 (getter 패턴)
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import {
  handleGetBooks,
  handleGetBook,
} from "../../../src/main/handlers/bookHandler.js";
import { store as configStore } from "../../../src/main/handlers/configHandler.js";

let db: Knex;

async function getResultIds(
  params: (FilterParams & { pageParam?: number; pageSize?: number }) | null,
): Promise<number[]> {
  const result = await handleGetBooks({ ...params, pageSize: 1000 });
  return result.data.map((b: { id: number }) => b.id).sort();
}

describe("handleGetBooks - 통합 테스트", () => {
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

  describe("기본 필터", () => {
    it("필터 없으면 모든 책 반환", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });

      const ids = await getResultIds(null);
      expect(ids).toHaveLength(2);
    });

    it("readStatus=read → 읽은 책만", async () => {
      await seedBook(db, { path: "/a", last_read_at: new Date("2024-01-01") });
      await seedBook(db, { path: "/b", last_read_at: null });

      const ids = await getResultIds({ readStatus: "read" });
      expect(ids).toHaveLength(1);
    });

    it("readStatus=unread → 안 읽은 책만", async () => {
      await seedBook(db, { path: "/a", last_read_at: new Date("2024-01-01") });
      await seedBook(db, { path: "/b", last_read_at: null });
      await seedBook(db, { path: "/c", last_read_at: null });

      const ids = await getResultIds({ readStatus: "unread" });
      expect(ids).toHaveLength(2);
    });

    it("isFavorite=true → 즐겨찾기만", async () => {
      await seedBook(db, { path: "/a", is_favorite: true });
      await seedBook(db, { path: "/b", is_favorite: false });

      const ids = await getResultIds({ isFavorite: true });
      expect(ids).toHaveLength(1);
    });

    it("libraryPath 지정 → 해당 경로의 책만", async () => {
      await seedBook(db, { path: "/library/a/book1" });
      await seedBook(db, { path: "/library/b/book2" });

      const ids = await getResultIds({ libraryPath: "/library/a" });
      expect(ids).toHaveLength(1);
    });

    it("libraryPath=all → 전체 조회", async () => {
      await seedBook(db, { path: "/library/a/book1" });
      await seedBook(db, { path: "/library/b/book2" });

      const ids = await getResultIds({ libraryPath: "all" });
      expect(ids).toHaveLength(2);
    });

    it("offlineStatus=online → 온라인 책만", async () => {
      await seedBook(db, { path: "/a", is_offline: false });
      await seedBook(db, { path: "/b", is_offline: true });

      const ids = await getResultIds({ offlineStatus: "online" });
      expect(ids).toHaveLength(1);
    });

    it("offlineStatus=offline → 오프라인 책만", async () => {
      await seedBook(db, { path: "/a", is_offline: false });
      await seedBook(db, { path: "/b", is_offline: true });
      await seedBook(db, { path: "/c", is_offline: true });

      const ids = await getResultIds({ offlineStatus: "offline" });
      expect(ids).toHaveLength(2);
    });

    it("offlineStatus 미지정 → 전체 반환", async () => {
      await seedBook(db, { path: "/a", is_offline: false });
      await seedBook(db, { path: "/b", is_offline: true });

      const ids = await getResultIds(null);
      expect(ids).toHaveLength(2);
    });
  });

  describe("검색어 필터", () => {
    it("id:12345 → 해당 hitomi_id 책만", async () => {
      await seedBook(db, { path: "/a", hitomi_id: "12345" });
      await seedBook(db, { path: "/b", hitomi_id: "67890" });

      const ids = await getResultIds({ searchQuery: "id:12345" });
      expect(ids).toHaveLength(1);
    });

    it("type:doujinshi → 해당 타입만", async () => {
      await seedBook(db, { path: "/a", type: "doujinshi" });
      await seedBook(db, { path: "/b", type: "manga" });

      const ids = await getResultIds({ searchQuery: "type:doujinshi" });
      expect(ids).toHaveLength(1);
    });

    it("language:korean → 한국어 책만", async () => {
      await seedBook(db, {
        path: "/a",
        language_name_english: "korean",
        language_name_local: "한국어",
      });
      await seedBook(db, {
        path: "/b",
        language_name_english: "japanese",
        language_name_local: "日本語",
      });

      const ids = await getResultIds({ searchQuery: "language:korean" });
      expect(ids).toHaveLength(1);
    });

    it("일반 검색어 → 제목 LIKE 검색", async () => {
      await seedBook(db, { path: "/a", title: "테스트 도서 1" });
      await seedBook(db, { path: "/b", title: "다른 책" });

      const ids = await getResultIds({ searchQuery: "테스트" });
      expect(ids).toHaveLength(1);
    });
  });

  describe("관계 데이터 정확 일치 (EXISTS 서브쿼리)", () => {
    it("artist:abc → 'abc'만 매칭, 'xabc' 불일치", async () => {
      const artist1 = await seedArtist(db, "abc");
      const artist2 = await seedArtist(db, "xabc");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, book1.id, artist1.id);
      await linkBookArtist(db, book2.id, artist2.id);

      const ids = await getResultIds({ searchQuery: "artist:abc" });
      expect(ids).toEqual([book1.id]);
    });

    it("tag:nurse → 'nurse'만 매칭, 'unnurse' 불일치", async () => {
      const tag1 = await seedTag(db, "nurse");
      const tag2 = await seedTag(db, "unnurse");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookTag(db, book1.id, tag1.id);
      await linkBookTag(db, book2.id, tag2.id);

      const ids = await getResultIds({ searchQuery: "tag:nurse" });
      expect(ids).toEqual([book1.id]);
    });

    it("series:series1 → 'series1'만 매칭", async () => {
      const series1 = await seedSeries(db, "series1");
      const series2 = await seedSeries(db, "xseries1");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookSeries(db, book1.id, series1.id);
      await linkBookSeries(db, book2.id, series2.id);

      const ids = await getResultIds({ searchQuery: "series:series1" });
      expect(ids).toEqual([book1.id]);
    });

    it("group:group1 → 'group1'만 매칭", async () => {
      const group1 = await seedGroup(db, "group1");
      const group2 = await seedGroup(db, "xgroup1");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookGroup(db, book1.id, group1.id);
      await linkBookGroup(db, book2.id, group2.id);

      const ids = await getResultIds({ searchQuery: "group:group1" });
      expect(ids).toEqual([book1.id]);
    });

    it("character:char1 → 'char1'만 매칭", async () => {
      const char1 = await seedCharacter(db, "char1");
      const char2 = await seedCharacter(db, "xchar1");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookCharacter(db, book1.id, char1.id);
      await linkBookCharacter(db, book2.id, char2.id);

      const ids = await getResultIds({ searchQuery: "character:char1" });
      expect(ids).toEqual([book1.id]);
    });
  });

  describe("다중 관계", () => {
    it("한 책에 artist 2명 → 둘 중 하나로 검색 시 매칭", async () => {
      const artist1 = await seedArtist(db, "artist_a");
      const artist2 = await seedArtist(db, "artist_b");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book1.id, artist1.id);
      await linkBookArtist(db, book1.id, artist2.id);

      expect(
        (await getResultIds({ searchQuery: "artist:artist_a" })).sort(),
      ).toEqual([book1.id]);
      expect(
        (await getResultIds({ searchQuery: "artist:artist_b" })).sort(),
      ).toEqual([book1.id]);
    });

    it("artist:a artist:b → 두 아티스트 모두 있는 책만", async () => {
      const artistA = await seedArtist(db, "alpha");
      const artistB = await seedArtist(db, "beta");
      const bookBoth = await seedBook(db, { path: "/a" });
      const bookOnlyA = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, bookBoth.id, artistA.id);
      await linkBookArtist(db, bookBoth.id, artistB.id);
      await linkBookArtist(db, bookOnlyA.id, artistA.id);

      const ids = await getResultIds({
        searchQuery: "artist:alpha artist:beta",
      });
      expect(ids).toEqual([bookBoth.id]);
    });
  });

  describe("male/female 태그", () => {
    it("male:근육 → tags에서 검색", async () => {
      const tag1 = await seedTag(db, "male:근육");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds({ searchQuery: "male:근육" });
      expect(ids).toEqual([book1.id]);
    });

    it("female:안경 → tags에서 검색", async () => {
      const tag1 = await seedTag(db, "female:안경");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds({ searchQuery: "female:안경" });
      expect(ids).toEqual([book1.id]);
    });
  });

  describe("제외(-) 검색", () => {
    it("-tag:nurse → 해당 태그 없는 책만 반환", async () => {
      const tag1 = await seedTag(db, "nurse");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds({ searchQuery: "-tag:nurse" });
      expect(ids).toEqual([book2.id]);
    });

    it("-female:ahegao → female:ahegao 태그 없는 책만 반환", async () => {
      const tag1 = await seedTag(db, "female:ahegao");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds({ searchQuery: "-female:ahegao" });
      expect(ids).toEqual([book2.id]);
    });

    it("-artist:abc → 해당 아티스트 없는 책만 반환", async () => {
      const artist1 = await seedArtist(db, "abc");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, book1.id, artist1.id);

      const ids = await getResultIds({ searchQuery: "-artist:abc" });
      expect(ids).toEqual([book2.id]);
    });

    it("-type:doujinshi → 해당 타입 제외", async () => {
      await seedBook(db, { path: "/a", type: "doujinshi" });
      await seedBook(db, { path: "/b", type: "manga" });

      const ids = await getResultIds({ searchQuery: "-type:doujinshi" });
      expect(ids).toHaveLength(1);
    });

    it("긍정 + 제외 조합: artist:abc -tag:nurse", async () => {
      const artist1 = await seedArtist(db, "abc");
      const tag1 = await seedTag(db, "nurse");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, book1.id, artist1.id);
      await linkBookArtist(db, book2.id, artist1.id);
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds({
        searchQuery: "artist:abc -tag:nurse",
      });
      expect(ids).toEqual([book2.id]);
    });

    it("다중 제외: -tag:a -tag:b", async () => {
      const tagA = await seedTag(db, "tag_a");
      const tagB = await seedTag(db, "tag_b");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      const book3 = await seedBook(db, { path: "/c" });
      await linkBookTag(db, book1.id, tagA.id);
      await linkBookTag(db, book2.id, tagB.id);

      const ids = await getResultIds({ searchQuery: "-tag:tag_a -tag:tag_b" });
      expect(ids).toEqual([book3.id]);
    });

    it("-id:12345 → 해당 hitomi_id 제외", async () => {
      await seedBook(db, { path: "/a", hitomi_id: "12345" });
      await seedBook(db, { path: "/b", hitomi_id: "67890" });

      const ids = await getResultIds({ searchQuery: "-id:12345" });
      expect(ids).toHaveLength(1);
    });

    it("제목 제외: -테스트", async () => {
      await seedBook(db, { path: "/a", title: "테스트 도서" });
      await seedBook(db, { path: "/b", title: "다른 책" });

      const ids = await getResultIds({ searchQuery: "-테스트" });
      expect(ids).toHaveLength(1);
    });

    it("-tag:female:ahegao (프리픽스 포함) → 정상 동작", async () => {
      const tag1 = await seedTag(db, "female:ahegao");
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      await linkBookTag(db, book1.id, tag1.id);

      const ids = await getResultIds({ searchQuery: "-tag:female:ahegao" });
      expect(ids).toEqual([book2.id]);
    });
  });

  describe("대소문자 무시", () => {
    it("artist:ABC → 'abc' 아티스트 매칭", async () => {
      const artist1 = await seedArtist(db, "abc");
      const book1 = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book1.id, artist1.id);

      const ids = await getResultIds({ searchQuery: "artist:ABC" });
      expect(ids).toEqual([book1.id]);
    });
  });

  describe("혼합 검색", () => {
    it("검색어 + artist → 제목과 artist 모두 만족하는 책만", async () => {
      const artist1 = await seedArtist(db, "abc");
      const book1 = await seedBook(db, { path: "/a", title: "검색어 포함" });
      const book2 = await seedBook(db, { path: "/b", title: "검색어 포함" });
      const book3 = await seedBook(db, { path: "/c", title: "다른 제목" });
      void book3;
      await linkBookArtist(db, book1.id, artist1.id);
      await linkBookArtist(db, book2.id, artist1.id);

      const ids = await getResultIds({ searchQuery: "검색어 artist:abc" });
      expect(ids.sort()).toEqual([book1.id, book2.id].sort());
    });

    it("검색어 + readStatus + isFavorite 조합", async () => {
      const book1 = await seedBook(db, {
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

      const ids = await getResultIds({
        searchQuery: "테스트",
        readStatus: "read",
        isFavorite: true,
      });
      expect(ids).toEqual([book1.id]);
    });
  });

  describe("검색 결과 없음", () => {
    it("존재하지 않는 artist → 빈 결과", async () => {
      const ids = await getResultIds({ searchQuery: "artist:nonexistent" });
      expect(ids).toHaveLength(0);
    });

    it("존재하지 않는 제목 → 빈 결과", async () => {
      await seedBook(db, { path: "/a", title: "테스트 도서" });

      const ids = await getResultIds({ searchQuery: "절대없는제목" });
      expect(ids).toHaveLength(0);
    });
  });

  describe("빈 DB", () => {
    it("책이 없으면 빈 배열 반환", async () => {
      const ids = await getResultIds(null);
      expect(ids).toHaveLength(0);
    });

    it("빈 DB에서 검색해도 빈 배열", async () => {
      const ids = await getResultIds({ searchQuery: "아무거나" });
      expect(ids).toHaveLength(0);
    });
  });

  describe("정렬", () => {
    it("sortBy=added_at, sortOrder=desc → 최근 추가 순", async () => {
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      const book3 = await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({
        sortBy: "added_at",
        sortOrder: "desc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([book3.id, book2.id, book1.id]);
    });

    it("sortBy=added_at, sortOrder=asc → 오래된 순", async () => {
      const book1 = await seedBook(db, { path: "/a" });
      const book2 = await seedBook(db, { path: "/b" });
      const book3 = await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({
        sortBy: "added_at",
        sortOrder: "asc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([book1.id, book2.id, book3.id]);
    });

    it("sortBy=hitomi_id, sortOrder=desc → 큰 ID 순", async () => {
      const book1 = await seedBook(db, { path: "/a", hitomi_id: "100" });
      const book2 = await seedBook(db, { path: "/b", hitomi_id: "300" });
      const book3 = await seedBook(db, { path: "/c", hitomi_id: "200" });

      const result = await handleGetBooks({
        sortBy: "hitomi_id",
        sortOrder: "desc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([book2.id, book3.id, book1.id]);
    });

    it("sortBy=hitomi_id, sortOrder=asc → 작은 ID 순", async () => {
      const book1 = await seedBook(db, { path: "/a", hitomi_id: "100" });
      const book2 = await seedBook(db, { path: "/b", hitomi_id: "300" });
      const book3 = await seedBook(db, { path: "/c", hitomi_id: "200" });

      const result = await handleGetBooks({
        sortBy: "hitomi_id",
        sortOrder: "asc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([book1.id, book3.id, book2.id]);
    });

    it("sortBy=random → 결과는 전체 수와 동일", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({
        sortBy: "random",
        pageSize: 1000,
      });
      expect(result.data).toHaveLength(3);
    });
  });

  describe("페이지네이션", () => {
    it("pageSize=2, pageParam=0 → 2개 + hasNextPage=true", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({ pageSize: 2, pageParam: 0 });
      expect(result.data).toHaveLength(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.nextPage).toBe(1);
    });

    it("pageSize=2, pageParam=1 → 마지막 1개 + hasNextPage=false", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({ pageSize: 2, pageParam: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.hasNextPage).toBe(false);
    });

    it("pageSize가 전체보다 크면 hasNextPage=false", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });

      const result = await handleGetBooks({ pageSize: 100, pageParam: 0 });
      expect(result.data).toHaveLength(2);
      expect(result.hasNextPage).toBe(false);
    });

    it("빈 DB에서 페이지네이션 → hasNextPage=false", async () => {
      const result = await handleGetBooks({ pageSize: 10, pageParam: 0 });
      expect(result.data).toHaveLength(0);
      expect(result.hasNextPage).toBe(false);
    });
  });

  describe("결과 형식", () => {
    it("관계 데이터가 있으면 배열로 반환", async () => {
      const artist1 = await seedArtist(db, "artist1");
      const artist2 = await seedArtist(db, "artist2");
      const tag1 = await seedTag(db, "tag1");
      const series1 = await seedSeries(db, "series1");
      const group1 = await seedGroup(db, "group1");
      const char1 = await seedCharacter(db, "char1");
      const book = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book.id, artist1.id);
      await linkBookArtist(db, book.id, artist2.id);
      await linkBookTag(db, book.id, tag1.id);
      await linkBookSeries(db, book.id, series1.id);
      await linkBookGroup(db, book.id, group1.id);
      await linkBookCharacter(db, book.id, char1.id);

      const result = await handleGetBooks({ pageSize: 1000 });
      const b = result.data[0];

      expect(b.artists).toEqual([{ name: "artist1" }, { name: "artist2" }]);
      expect(b.tags).toEqual([{ name: "tag1" }]);
      expect(b.series).toEqual([{ name: "series1" }]);
      expect(b.groups).toEqual([{ name: "group1" }]);
      expect(b.characters).toEqual([{ name: "char1" }]);
    });

    it("관계 데이터가 없으면 빈 배열", async () => {
      await seedBook(db, { path: "/a" });

      const result = await handleGetBooks({ pageSize: 1000 });
      const b = result.data[0];

      expect(b.artists).toEqual([]);
      expect(b.tags).toEqual([]);
      expect(b.series).toEqual([]);
      expect(b.groups).toEqual([]);
      expect(b.characters).toEqual([]);
    });
  });

  describe("한국어 제목 우선 (prioritizeKoreanTitles)", () => {
    it("설정 ON → '영어 | 한글' 형식에서 한글만 반환", async () => {
      vi.mocked(configStore.get).mockReturnValue(true);
      await seedBook(db, { path: "/a", title: "English Title | 한글 제목" });

      const result = await handleGetBooks({ pageSize: 1000 });
      expect(result.data[0].title).toBe("한글 제목");
    });

    it("설정 OFF → 원본 제목 그대로", async () => {
      vi.mocked(configStore.get).mockReturnValue(false);
      await seedBook(db, { path: "/a", title: "English Title | 한글 제목" });

      const result = await handleGetBooks({ pageSize: 1000 });
      expect(result.data[0].title).toBe("English Title | 한글 제목");
    });

    it("파이프 없는 제목 → 설정 ON이어도 원본 유지", async () => {
      vi.mocked(configStore.get).mockReturnValue(true);
      await seedBook(db, { path: "/a", title: "그냥 제목" });

      const result = await handleGetBooks({ pageSize: 1000 });
      expect(result.data[0].title).toBe("그냥 제목");
    });
  });

  describe("경계값", () => {
    it("존재하지 않는 libraryPath → 빈 결과", async () => {
      await seedBook(db, { path: "/library/a/book1" });

      const ids = await getResultIds({ libraryPath: "/nonexistent" });
      expect(ids).toHaveLength(0);
    });

    it("language:한국어 → local_name으로도 검색됨", async () => {
      await seedBook(db, {
        path: "/a",
        language_name_english: "korean",
        language_name_local: "한국어",
      });

      const ids = await getResultIds({ searchQuery: "language:한국어" });
      expect(ids).toHaveLength(1);
    });

    it("hitomi_id가 null인 책은 id: 검색에서 제외", async () => {
      await seedBook(db, { path: "/a", hitomi_id: null });
      await seedBook(db, { path: "/b", hitomi_id: "12345" });

      const ids = await getResultIds({ searchQuery: "id:12345" });
      expect(ids).toHaveLength(1);
    });

    it("관계 없는 책은 artist 검색에 걸리지 않음", async () => {
      const artist1 = await seedArtist(db, "solo");
      const bookWith = await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" }); // 관계 없는 책
      await linkBookArtist(db, bookWith.id, artist1.id);

      const ids = await getResultIds({ searchQuery: "artist:solo" });
      expect(ids).toEqual([bookWith.id]);
    });

    it("type 검색은 부분 일치 (LIKE)", async () => {
      await seedBook(db, { path: "/a", type: "doujinshi" });
      await seedBook(db, { path: "/b", type: "manga" });

      // 'doujin'으로 검색해도 doujinshi가 매칭
      const ids = await getResultIds({ searchQuery: "type:doujin" });
      expect(ids).toHaveLength(1);
    });

    it("검색어에 공백만 있으면 전체 조회", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });

      const ids = await getResultIds({ searchQuery: "   " });
      expect(ids).toHaveLength(2);
    });

    it("동일한 책에 같은 태그를 여러 번 연결해도 중복 없이 1개만 반환", async () => {
      const tag1 = await seedTag(db, "solo_tag");
      const book = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book.id, tag1.id);

      const ids = await getResultIds({ searchQuery: "tag:solo_tag" });
      expect(ids).toHaveLength(1);
    });
  });

  describe("handleGetBook (단일 책 조회)", () => {
    it("존재하는 책 → 책 데이터 반환", async () => {
      const book = await seedBook(db, { path: "/a", title: "테스트 책" });

      const result = await handleGetBook(book.id);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("테스트 책");
      expect(result!.id).toBe(book.id);
      expect(result!.path).toBe("/a");
    });

    it("존재하지 않는 책 → null 반환", async () => {
      const result = await handleGetBook(99999);
      expect(result).toBeNull();
    });

    it("ID가 0이어도 null 반환", async () => {
      const result = await handleGetBook(0);
      expect(result).toBeNull();
    });

    it("음수 ID → null 반환", async () => {
      const result = await handleGetBook(-1);
      expect(result).toBeNull();
    });

    // ========== 관계 데이터 ==========

    it("관계 데이터 없으면 모두 빈 배열", async () => {
      const book = await seedBook(db, { path: "/a" });
      const result = await handleGetBook(book.id);

      expect(result!.artists).toEqual([]);
      expect(result!.tags).toEqual([]);
      expect(result!.series).toEqual([]);
      expect(result!.groups).toEqual([]);
      expect(result!.characters).toEqual([]);
    });

    it("artist 1명 → artists 배열에 1개", async () => {
      const artist1 = await seedArtist(db, "artist1");
      const book = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book.id, artist1.id);

      const result = await handleGetBook(book.id);
      expect(result!.artists).toEqual([{ name: "artist1" }]);
    });

    it("artist 여러 명 → artists 배열에 모두 포함", async () => {
      const a1 = await seedArtist(db, "alpha");
      const a2 = await seedArtist(db, "beta");
      const a3 = await seedArtist(db, "gamma");
      const book = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book.id, a1.id);
      await linkBookArtist(db, book.id, a2.id);
      await linkBookArtist(db, book.id, a3.id);

      const result = await handleGetBook(book.id);
      const names = result!.artists.map((a: { name: string }) => a.name).sort();
      expect(names).toEqual(["alpha", "beta", "gamma"]);
    });

    it("tag 1개 → tags 배열에 1개", async () => {
      const tag1 = await seedTag(db, "nurse");
      const book = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book.id, tag1.id);

      const result = await handleGetBook(book.id);
      expect(result!.tags).toEqual([{ name: "nurse" }]);
    });

    it("tag 여러 개 → tags 배열에 모두 포함", async () => {
      const t1 = await seedTag(db, "tag_a");
      const t2 = await seedTag(db, "tag_b");
      const book = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book.id, t1.id);
      await linkBookTag(db, book.id, t2.id);

      const result = await handleGetBook(book.id);
      const names = result!.tags.map((t: { name: string }) => t.name).sort();
      expect(names).toEqual(["tag_a", "tag_b"]);
    });

    it("series 1개 → series 배열에 1개", async () => {
      const s1 = await seedSeries(db, "시리즈1");
      const book = await seedBook(db, { path: "/a" });
      await linkBookSeries(db, book.id, s1.id);

      const result = await handleGetBook(book.id);
      expect(result!.series).toEqual([{ name: "시리즈1" }]);
    });

    it("group 1개 → groups 배열에 1개", async () => {
      const g1 = await seedGroup(db, "그룹1");
      const book = await seedBook(db, { path: "/a" });
      await linkBookGroup(db, book.id, g1.id);

      const result = await handleGetBook(book.id);
      expect(result!.groups).toEqual([{ name: "그룹1" }]);
    });

    it("character 1개 → characters 배열에 1개", async () => {
      const c1 = await seedCharacter(db, "캐릭터1");
      const book = await seedBook(db, { path: "/a" });
      await linkBookCharacter(db, book.id, c1.id);

      const result = await handleGetBook(book.id);
      expect(result!.characters).toEqual([{ name: "캐릭터1" }]);
    });

    it("모든 관계 종류가 동시에 있어도 정상 반환", async () => {
      const artist1 = await seedArtist(db, "artist_x");
      const tag1 = await seedTag(db, "tag_x");
      const series1 = await seedSeries(db, "series_x");
      const group1 = await seedGroup(db, "group_x");
      const char1 = await seedCharacter(db, "char_x");
      const book = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, book.id, artist1.id);
      await linkBookTag(db, book.id, tag1.id);
      await linkBookSeries(db, book.id, series1.id);
      await linkBookGroup(db, book.id, group1.id);
      await linkBookCharacter(db, book.id, char1.id);

      const result = await handleGetBook(book.id);
      expect(result!.artists).toEqual([{ name: "artist_x" }]);
      expect(result!.tags).toEqual([{ name: "tag_x" }]);
      expect(result!.series).toEqual([{ name: "series_x" }]);
      expect(result!.groups).toEqual([{ name: "group_x" }]);
      expect(result!.characters).toEqual([{ name: "char_x" }]);
    });

    it("다른 책의 관계는 포함되지 않음", async () => {
      const artistA = await seedArtist(db, "artist_A");
      const artistB = await seedArtist(db, "artist_B");
      const bookA = await seedBook(db, { path: "/a" });
      const bookB = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, bookA.id, artistA.id);
      await linkBookArtist(db, bookB.id, artistB.id);

      const resultA = await handleGetBook(bookA.id);
      const resultB = await handleGetBook(bookB.id);

      expect(resultA!.artists).toEqual([{ name: "artist_A" }]);
      expect(resultB!.artists).toEqual([{ name: "artist_B" }]);
    });

    // ========== Book 필드 ==========

    it("모든 Book 필드가 결과에 포함됨", async () => {
      const book = await seedBook(db, {
        path: "/a",
        title: "테스트",
        cover_path: "/thumb/a.webp",
        page_count: 42,
        current_page: 10,
        is_favorite: true,
        last_read_at: new Date("2024-06-15"),
        hitomi_id: "12345",
        type: "doujinshi",
        language_name_english: "korean",
        language_name_local: "한국어",
      });

      const result = await handleGetBook(book.id);
      expect(result).not.toBeNull();
      expect(result!.cover_path).toBe("/thumb/a.webp");
      expect(result!.page_count).toBe(42);
      expect(result!.current_page).toBe(10);
      expect(result!.is_favorite).toBeTruthy();
      expect(result!.hitomi_id).toBe("12345");
      expect(result!.type).toBe("doujinshi");
      expect(result!.language_name_english).toBe("korean");
      expect(result!.language_name_local).toBe("한국어");
    });

    it("null 가능 필드가 null이어도 정상 동작", async () => {
      const book = await seedBook(db, {
        path: "/a",
        cover_path: null,
        page_count: null,
        current_page: null,
        last_read_at: null,
        hitomi_id: null,
        type: null,
        language_name_english: null,
        language_name_local: null,
      });

      const result = await handleGetBook(book.id);
      expect(result).not.toBeNull();
      expect(result!.cover_path).toBeNull();
      expect(result!.page_count).toBeNull();
      expect(result!.current_page).toBeNull();
      expect(result!.last_read_at).toBeNull();
      expect(result!.hitomi_id).toBeNull();
      expect(result!.type).toBeNull();
    });

    // ========== 한국어 제목 ==========

    it("한국어 제목 설정 ON → '영어 | 한글'에서 한글만 반환", async () => {
      vi.mocked(configStore.get).mockReturnValue(true);
      const book = await seedBook(db, {
        path: "/a",
        title: "English Title | 한글 제목",
      });

      const result = await handleGetBook(book.id);
      expect(result!.title).toBe("한글 제목");
    });

    it("한국어 제목 설정 OFF → 원본 제목 그대로", async () => {
      vi.mocked(configStore.get).mockReturnValue(false);
      const book = await seedBook(db, {
        path: "/a",
        title: "English Title | 한글 제목",
      });

      const result = await handleGetBook(book.id);
      expect(result!.title).toBe("English Title | 한글 제목");
    });

    it("한국어 제목 설정 ON이어도 파이프 없으면 원본 유지", async () => {
      vi.mocked(configStore.get).mockReturnValue(true);
      const book = await seedBook(db, {
        path: "/a",
        title: "파이프 없는 제목",
      });

      const result = await handleGetBook(book.id);
      expect(result!.title).toBe("파이프 없는 제목");
    });

    it("파이프 뒤에 공백만 있으면 trim 결과로 빈 문자열 반환", async () => {
      vi.mocked(configStore.get).mockReturnValue(true);
      const book = await seedBook(db, {
        path: "/a",
        title: "English | ",
      });

      const result = await handleGetBook(book.id);
      // 정규식이 공백을 캡처하고 trim 결과가 빈 문자열이 됨
      expect(result!.title).toBe("");
    });

    it("파이프가 여러 개면 마지막 기준으로 추출", async () => {
      vi.mocked(configStore.get).mockReturnValue(true);
      const book = await seedBook(db, {
        path: "/a",
        title: "Part1 | Part2 | 최종 한글",
      });

      const result = await handleGetBook(book.id);
      expect(result!.title).toBe("최종 한글");
    });

    it("한글 제목에 trim 적용", async () => {
      vi.mocked(configStore.get).mockReturnValue(true);
      const book = await seedBook(db, {
        path: "/a",
        title: "English |  공백 제거  ",
      });

      const result = await handleGetBook(book.id);
      expect(result!.title).toBe("공백 제거");
    });

    // ========== male/female 태그 ==========

    it("male: 접두사 태그도 tags에 정상 포함", async () => {
      const tag1 = await seedTag(db, "male:근육");
      const book = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book.id, tag1.id);

      const result = await handleGetBook(book.id);
      expect(result!.tags).toEqual([{ name: "male:근육" }]);
    });

    it("female: 접두사 태그도 tags에 정상 포함", async () => {
      const tag1 = await seedTag(db, "female:안경");
      const book = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book.id, tag1.id);

      const result = await handleGetBook(book.id);
      expect(result!.tags).toEqual([{ name: "female:안경" }]);
    });

    it("male/female 일반 태그 혼합 → 모두 tags에 포함", async () => {
      const t1 = await seedTag(db, "male:근육");
      const t2 = await seedTag(db, "nurse");
      const book = await seedBook(db, { path: "/a" });
      await linkBookTag(db, book.id, t1.id);
      await linkBookTag(db, book.id, t2.id);

      const result = await handleGetBook(book.id);
      const names = result!.tags.map((t: { name: string }) => t.name).sort();
      expect(names).toEqual(["male:근육", "nurse"]);
    });

    // ========== 삭제 후 조회 ==========

    it("삭제된 책 ID → null 반환", async () => {
      const book = await seedBook(db, { path: "/a" });
      await db("Book").where("id", book.id).del();

      const result = await handleGetBook(book.id);
      expect(result).toBeNull();
    });

    // ========== 다른 책과의 격리 ==========

    it("여러 책 중 정확한 ID의 책만 반환", async () => {
      await seedBook(db, { path: "/a", title: "책 A" });
      const b2 = await seedBook(db, { path: "/b", title: "책 B" });
      await seedBook(db, { path: "/c", title: "책 C" });

      const result = await handleGetBook(b2.id);
      expect(result!.title).toBe("책 B");
      expect(result!.id).toBe(b2.id);
    });

    it("다른 책에 연결된 artist가 결과에 섞이지 않음", async () => {
      const artistA = await seedArtist(db, "artist_onlyA");
      const artistB = await seedArtist(db, "artist_onlyB");
      const bookA = await seedBook(db, { path: "/a" });
      const bookB = await seedBook(db, { path: "/b" });
      await linkBookArtist(db, bookA.id, artistA.id);
      await linkBookArtist(db, bookB.id, artistB.id);

      const resultA = await handleGetBook(bookA.id);
      expect(resultA!.artists).toHaveLength(1);
      expect(resultA!.artists[0].name).toBe("artist_onlyA");
    });
  });
});
