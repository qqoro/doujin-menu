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
  normalizeSortBy,
  normalizeSortOrder,
  clampRating,
} from "../../../src/main/handlers/bookHandler.js";

// ========== 유닛 테스트: 순수 함수 ==========

describe("정렬 파라미터 정규화", () => {
  it("허용 컬럼은 그대로 통과한다", () => {
    expect(normalizeSortBy("title")).toBe("title");
    expect(normalizeSortBy("hitomi_id")).toBe("hitomi_id");
    expect(normalizeSortBy("random")).toBe("random");
  });

  it("목록에 없는 값은 added_at으로 떨어진다", () => {
    expect(normalizeSortBy("id; DROP TABLE Book")).toBe("added_at");
    expect(normalizeSortBy("")).toBe("added_at");
    expect(normalizeSortBy(undefined)).toBe("added_at");
    expect(normalizeSortBy(null)).toBe("added_at");
    expect(normalizeSortBy(123)).toBe("added_at");
  });

  it("정렬 방향은 asc가 아니면 전부 desc다", () => {
    expect(normalizeSortOrder("asc")).toBe("asc");
    expect(normalizeSortOrder("desc")).toBe("desc");
    expect(normalizeSortOrder("ASC")).toBe("desc");
    expect(normalizeSortOrder(undefined)).toBe("desc");
    expect(normalizeSortOrder("desc, (SELECT 1)")).toBe("desc");
  });

  it("별점도 정렬 컬럼으로 통과한다", () => {
    expect(normalizeSortBy("rating")).toBe("rating");
  });
});

describe("clampRating", () => {
  it("0~5는 그대로 통과한다", () => {
    expect(clampRating(0)).toBe(0);
    expect(clampRating(3)).toBe(3);
    expect(clampRating(5)).toBe(5);
  });

  it("범위를 벗어나면 잘라낸다", () => {
    expect(clampRating(-1)).toBe(0);
    expect(clampRating(6)).toBe(5);
    expect(clampRating(999)).toBe(5);
  });

  it("정수가 아니면 반올림한다", () => {
    expect(clampRating(3.4)).toBe(3);
    expect(clampRating(3.6)).toBe(4);
  });

  it("숫자가 아니면 미평가(0)로 떨어진다", () => {
    expect(clampRating(undefined)).toBe(0);
    expect(clampRating(null)).toBe(0);
    expect(clampRating("5")).toBe(0);
    expect(clampRating(NaN)).toBe(0);
    expect(clampRating(Infinity)).toBe(0);
  });
});

describe("parseSearchQuery", () => {
  it("빈 문자열 → 모든 항목 빈 배열", () => {
    const result = parseSearchQuery("");
    expect(result.titleTerms).toEqual([]);
    expect(result.idTerms).toEqual([]);
    expect(result.idRanges).toEqual([]);
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
      expect(result.idRanges).toEqual([]);
    });
  });

  describe("히토미 ID 범위", () => {
    it("id:>3000000 → 초과는 경계를 한 칸 민 최소값", () => {
      const result = parseSearchQuery("id:>3000000");
      expect(result.idRanges).toEqual([{ min: 3000001 }]);
      expect(result.idTerms).toEqual([]);
    });

    it("id:>=3000000 → 이상은 경계 그대로", () => {
      expect(parseSearchQuery("id:>=3000000").idRanges).toEqual([
        { min: 3000000 },
      ]);
    });

    it("id:<3000000 / id:<=3000000", () => {
      expect(parseSearchQuery("id:<3000000").idRanges).toEqual([
        { max: 2999999 },
      ]);
      expect(parseSearchQuery("id:<=3000000").idRanges).toEqual([
        { max: 3000000 },
      ]);
    });

    it("id:3000000-3200000 → 양끝 포함 구간", () => {
      expect(parseSearchQuery("id:3000000-3200000").idRanges).toEqual([
        { min: 3000000, max: 3200000 },
      ]);
    });

    it("id:3200000~3000000 → 거꾸로 적어도 뒤집어 받는다", () => {
      expect(parseSearchQuery("id:3200000~3000000").idRanges).toEqual([
        { min: 3000000, max: 3200000 },
      ]);
    });

    it("범위 여러 개는 함께 좁힌다", () => {
      const result = parseSearchQuery("id:>=3000000 id:<=3200000");
      expect(result.idRanges).toEqual([{ min: 3000000 }, { max: 3200000 }]);
    });

    it("-id:<3000000 → exclude.idRanges에 분류", () => {
      const result = parseSearchQuery("-id:<3000000");
      expect(result.idRanges).toEqual([]);
      expect(result.exclude.idRanges).toEqual([{ max: 2999999 }]);
    });

    it("범위가 아닌 값은 기존대로 정확히 일치", () => {
      const result = parseSearchQuery("id:12345-");
      expect(result.idRanges).toEqual([]);
      expect(result.idTerms).toEqual(["12345-"]);
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
  handleGetNextBook,
  handleGetPrevBook,
  handleCheckBooksExistByHitomiIds,
  handleSetBookRating,
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

    it("readStatus=completed → 마지막 페이지까지 본 책만", async () => {
      await seedBook(db, { path: "/a", current_page: 20, page_count: 20 });
      await seedBook(db, { path: "/b", current_page: 25, page_count: 20 });
      await seedBook(db, { path: "/c", current_page: 19, page_count: 20 });

      const ids = await getResultIds({ readStatus: ["completed"] });
      expect(ids).toHaveLength(2);
    });

    it("readStatus=reading → 2페이지 이상 봤지만 안 끝낸 책만", async () => {
      await seedBook(db, { path: "/a", current_page: 2, page_count: 20 });
      await seedBook(db, { path: "/b", current_page: 19, page_count: 20 });
      await seedBook(db, { path: "/c", current_page: 20, page_count: 20 });
      await seedBook(db, { path: "/d", current_page: 1, page_count: 20 });

      const ids = await getResultIds({ readStatus: ["reading"] });
      expect(ids).toHaveLength(2);
    });

    it("readStatus=unread → 1페이지에서 멈춘 책도 안 읽음으로 본다", async () => {
      // 책을 열기만 해도 last_read_at은 채워지므로 그것만으로는 읽었다고 볼 수 없다
      await seedBook(db, {
        path: "/a",
        current_page: 1,
        page_count: 20,
        last_read_at: new Date("2024-01-01"),
      });
      await seedBook(db, { path: "/b", current_page: 0, page_count: 20 });
      await seedBook(db, { path: "/c", current_page: null, page_count: 20 });
      await seedBook(db, { path: "/d", current_page: 5, page_count: 20 });

      const ids = await getResultIds({ readStatus: ["unread"] });
      expect(ids).toHaveLength(3);
    });

    it("1페이지짜리 책은 완독으로만 잡히고 안 읽음에는 빠진다", async () => {
      await seedBook(db, { path: "/a", current_page: 1, page_count: 1 });

      expect(await getResultIds({ readStatus: ["completed"] })).toHaveLength(1);
      expect(await getResultIds({ readStatus: ["unread"] })).toHaveLength(0);
      expect(await getResultIds({ readStatus: ["reading"] })).toHaveLength(0);
    });

    it("세 구간은 서로 겹치지 않고 전체를 덮는다", async () => {
      const rows = [
        { current_page: null, page_count: 20 },
        { current_page: 0, page_count: 20 },
        { current_page: 1, page_count: 20 },
        { current_page: 2, page_count: 20 },
        { current_page: 19, page_count: 20 },
        { current_page: 20, page_count: 20 },
        { current_page: 25, page_count: 20 },
        { current_page: 1, page_count: 1 },
        // 페이지 수를 모르는 책도 반드시 어느 한 구간에는 잡혀야 한다
        { current_page: null, page_count: null },
        { current_page: 5, page_count: null },
        { current_page: 0, page_count: 0 },
        { current_page: 5, page_count: 0 },
      ];
      for (const [index, row] of rows.entries()) {
        await seedBook(db, { path: `/book-${index}`, ...row });
      }

      const unread = await getResultIds({ readStatus: ["unread"] });
      const reading = await getResultIds({ readStatus: ["reading"] });
      const completed = await getResultIds({ readStatus: ["completed"] });
      const union = [...unread, ...reading, ...completed];

      expect(new Set(union).size).toBe(union.length);
      expect(union).toHaveLength(rows.length);
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

      const ids = await getResultIds({ libraryPath: ["/library/a"] });
      expect(ids).toHaveLength(1);
    });

    it("libraryPath 빈 배열 → 전체 조회", async () => {
      await seedBook(db, { path: "/library/a/book1" });
      await seedBook(db, { path: "/library/b/book2" });

      const ids = await getResultIds({ libraryPath: [] });
      expect(ids).toHaveLength(2);
    });

    it("libraryPath 여러 개 → 고른 폴더들의 책만", async () => {
      await seedBook(db, { path: "/library/a/book1" });
      await seedBook(db, { path: "/library/b/book2" });
      await seedBook(db, { path: "/library/c/book3" });

      const ids = await getResultIds({
        libraryPath: ["/library/a", "/library/c"],
      });
      expect(ids).toHaveLength(2);
    });

    it("readStatus 여러 개 → 고른 구간의 합집합", async () => {
      const unread = await seedBook(db, {
        path: "/a",
        current_page: 1,
        page_count: 20,
      });
      const reading = await seedBook(db, {
        path: "/b",
        current_page: 10,
        page_count: 20,
      });
      await seedBook(db, { path: "/c", current_page: 20, page_count: 20 });

      const ids = await getResultIds({ readStatus: ["unread", "reading"] });
      expect(ids).toEqual([unread.id, reading.id].sort());
    });

    it("readStatus 세 구간 전부 → 전체 조회와 같다", async () => {
      await seedBook(db, { path: "/a", current_page: 1, page_count: 20 });
      await seedBook(db, { path: "/b", current_page: 10, page_count: 20 });
      await seedBook(db, { path: "/c", current_page: 20, page_count: 20 });

      const ids = await getResultIds({
        readStatus: ["unread", "reading", "completed"],
      });
      expect(ids).toHaveLength(3);
    });

    it("readStatus 빈 배열 → 전체 조회", async () => {
      await seedBook(db, { path: "/a", current_page: 1, page_count: 20 });
      await seedBook(db, { path: "/b", current_page: 20, page_count: 20 });

      const ids = await getResultIds({ readStatus: [] });
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

    it("숫자만 입력 → 제목 일치와 hitomi_id 일치를 함께 반환", async () => {
      const byId = await seedBook(db, {
        path: "/a",
        title: "제목에 숫자 없음",
        hitomi_id: "1234567",
      });
      const byTitle = await seedBook(db, {
        path: "/b",
        title: "1234567 번째 이야기",
        hitomi_id: "555",
      });
      await seedBook(db, { path: "/c", title: "무관한 책", hitomi_id: "999" });

      const ids = await getResultIds({ searchQuery: "1234567" });
      expect(ids).toHaveLength(2);
      expect(ids).toContain(byId.id);
      expect(ids).toContain(byTitle.id);
    });

    it("-숫자 → hitomi_id가 일치하는 책도 제외", async () => {
      await seedBook(db, { path: "/a", hitomi_id: "1234567" });
      const kept = await seedBook(db, { path: "/b", hitomi_id: "555" });

      const ids = await getResultIds({ searchQuery: "-1234567" });
      expect(ids).toEqual([kept.id]);
    });

    it("숫자가 섞인 낱말은 ID로 보지 않는다", async () => {
      await seedBook(db, {
        path: "/a",
        title: "무관한 책",
        hitomi_id: "1234567",
      });
      const byTitle = await seedBook(db, { path: "/b", title: "1234567화" });

      const ids = await getResultIds({ searchQuery: "1234567화" });
      expect(ids).toEqual([byTitle.id]);
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
        current_page: 20,
        page_count: 20,
      });
      await seedBook(db, {
        path: "/b",
        title: "테스트",
        is_favorite: true,
        current_page: 1,
        page_count: 20,
      });
      await seedBook(db, {
        path: "/c",
        title: "테스트",
        is_favorite: false,
        current_page: 20,
        page_count: 20,
      });

      const ids = await getResultIds({
        searchQuery: "테스트",
        readStatus: ["completed"],
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

    // 아래 정렬 테스트들은 쿼리 구조를 바꿔도 순서가 보존되는지 잡기 위한 것이다.
    // artists는 Book 테이블 컬럼이 아니라 GROUP_CONCAT 집계 결과를 정렬 기준으로 쓴다.
    it("sortBy=artists, sortOrder=asc → 작가명 오름차순, 작가 없는 책이 앞", async () => {
      const alpha = await seedArtist(db, "alpha");
      const beta = await seedArtist(db, "beta");
      const bookAlpha = await seedBook(db, { path: "/a" });
      const bookBeta = await seedBook(db, { path: "/b" });
      const bookNone = await seedBook(db, { path: "/c" });
      await linkBookArtist(db, bookAlpha.id, alpha.id);
      await linkBookArtist(db, bookBeta.id, beta.id);

      const result = await handleGetBooks({
        sortBy: "artists",
        sortOrder: "asc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([bookNone.id, bookAlpha.id, bookBeta.id]);
    });

    it("sortBy=artists, sortOrder=desc → 작가명 내림차순", async () => {
      const alpha = await seedArtist(db, "alpha");
      const beta = await seedArtist(db, "beta");
      const bookAlpha = await seedBook(db, { path: "/a" });
      const bookBeta = await seedBook(db, { path: "/b" });
      const bookNone = await seedBook(db, { path: "/c" });
      await linkBookArtist(db, bookAlpha.id, alpha.id);
      await linkBookArtist(db, bookBeta.id, beta.id);

      const result = await handleGetBooks({
        sortBy: "artists",
        sortOrder: "desc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([bookBeta.id, bookAlpha.id, bookNone.id]);
    });

    it("sortBy=artists → 작가가 여러 명인 책도 정렬에 포함", async () => {
      const alpha = await seedArtist(db, "alpha");
      const zulu = await seedArtist(db, "zulu");
      const mike = await seedArtist(db, "mike");
      // id 순서와 작가명 순서를 일부러 어긋나게 둔다. 같게 두면 id로만
      // 정렬해도 통과해서 이 테스트가 아무것도 구별하지 못한다.
      const bookMid = await seedBook(db, { path: "/b" });
      const bookMulti = await seedBook(db, { path: "/a" });
      await linkBookArtist(db, bookMulti.id, alpha.id);
      await linkBookArtist(db, bookMulti.id, zulu.id);
      await linkBookArtist(db, bookMid.id, mike.id);

      const result = await handleGetBooks({
        sortBy: "artists",
        sortOrder: "asc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      // "alpha,zulu" < "mike" 이므로 id가 큰 다중 작가 책이 앞선다
      expect(ids).toEqual([bookMulti.id, bookMid.id]);
    });

    // 시드 셔플의 존재 이유가 페이지 간 순서 고정이다. 이게 깨지면 스크롤 중
    // 같은 책이 두 번 나오거나 어떤 책은 영영 안 나온다.
    it("sortBy=random + 같은 randomSeed → 페이지를 나눠 받아도 중복·누락 없음", async () => {
      const seeded = [];
      for (const path of ["/a", "/b", "/c", "/d", "/e", "/f"]) {
        seeded.push(await seedBook(db, { path }));
      }

      const collected: number[] = [];
      for (let page = 0; page < 3; page++) {
        const result = await handleGetBooks({
          sortBy: "random",
          randomSeed: 12345,
          pageSize: 2,
          pageParam: page,
        });
        collected.push(...result.data.map((b: { id: number }) => b.id));
      }

      expect(collected).toHaveLength(6);
      expect(new Set(collected).size).toBe(6);
      expect([...collected].sort()).toEqual(seeded.map((b) => b.id).sort());
    });

    it("sortBy=random + 같은 randomSeed → 두 번 조회해도 같은 순서", async () => {
      for (const path of ["/a", "/b", "/c", "/d", "/e"]) {
        await seedBook(db, { path });
      }

      const first = await handleGetBooks({
        sortBy: "random",
        randomSeed: 777,
        pageSize: 1000,
      });
      const second = await handleGetBooks({
        sortBy: "random",
        randomSeed: 777,
        pageSize: 1000,
      });

      expect(first.data.map((b: { id: number }) => b.id)).toEqual(
        second.data.map((b: { id: number }) => b.id),
      );
    });

    it("정렬 + 페이지네이션 → 페이지 경계에서 순서가 이어짐", async () => {
      const books = [];
      for (const path of ["/a", "/b", "/c", "/d", "/e"]) {
        books.push(await seedBook(db, { path }));
      }
      const expected = books.map((b) => b.id).reverse(); // added_at desc

      const page0 = await handleGetBooks({
        sortBy: "added_at",
        sortOrder: "desc",
        pageSize: 2,
        pageParam: 0,
      });
      const page1 = await handleGetBooks({
        sortBy: "added_at",
        sortOrder: "desc",
        pageSize: 2,
        pageParam: 1,
      });
      const page2 = await handleGetBooks({
        sortBy: "added_at",
        sortOrder: "desc",
        pageSize: 2,
        pageParam: 2,
      });

      const joined = [...page0.data, ...page1.data, ...page2.data].map(
        (b: { id: number }) => b.id,
      );
      expect(joined).toEqual(expected);
    });

    it("필터 + 페이지네이션 → hasNextPage가 필터된 건수 기준", async () => {
      await seedBook(db, { path: "/a", is_favorite: true });
      await seedBook(db, { path: "/b", is_favorite: true });
      await seedBook(db, { path: "/c", is_favorite: false });
      await seedBook(db, { path: "/d", is_favorite: false });

      const page0 = await handleGetBooks({
        isFavorite: true,
        pageSize: 2,
        pageParam: 0,
      });
      expect(page0.data).toHaveLength(2);
      // 즐겨찾기는 2건뿐이므로 전체 4건과 무관하게 다음 페이지가 없어야 한다
      expect(page0.hasNextPage).toBe(false);
    });
  });

  // 가상 스크롤은 스크롤러 높이를 잡으려고 첫 청크보다 먼저 총 건수가 필요하고,
  // 청크마다 COUNT를 다시 돌리면 5만 권에서 호출당 0.02~0.17초를 그냥 버린다.
  describe("총 건수 (totalCount / skipCount)", () => {
    it("totalCount가 전체 건수를 반환", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({ pageSize: 1000 });
      expect(result.totalCount).toBe(3);
    });

    it("totalCount는 pageSize와 무관하게 전체 건수", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({ pageSize: 1, pageParam: 0 });
      expect(result.data).toHaveLength(1);
      expect(result.totalCount).toBe(3);
    });

    it("totalCount는 필터가 적용된 건수", async () => {
      await seedBook(db, { path: "/a", is_favorite: true });
      await seedBook(db, { path: "/b", is_favorite: false });
      await seedBook(db, { path: "/c", is_favorite: false });

      const result = await handleGetBooks({ isFavorite: true, pageSize: 1000 });
      expect(result.totalCount).toBe(1);
    });

    it("빈 결과의 totalCount는 0", async () => {
      const result = await handleGetBooks({ pageSize: 1000 });
      expect(result.totalCount).toBe(0);
    });

    it("skipCount=true → totalCount 없음, data는 정상", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({
        pageSize: 2,
        pageParam: 0,
        skipCount: true,
      });
      expect(result.data).toHaveLength(2);
      expect(result.totalCount).toBeUndefined();
    });

    it("skipCount=true → hasNextPage도 없음 (총 건수 없이는 계산 불가)", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });

      const result = await handleGetBooks({
        pageSize: 1,
        pageParam: 0,
        skipCount: true,
      });
      expect(result.hasNextPage).toBeUndefined();
    });

    it("skipCount=true여도 정렬과 offset은 그대로 적용", async () => {
      const b1 = await seedBook(db, { path: "/a" });
      const b2 = await seedBook(db, { path: "/b" });
      const b3 = await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({
        sortBy: "added_at",
        sortOrder: "desc",
        pageSize: 2,
        pageParam: 1,
        skipCount: true,
      });
      // desc 순서는 b3, b2, b1 이므로 두 번째 페이지는 b1 하나
      expect(result.data.map((b: { id: number }) => b.id)).toEqual([b1.id]);
      void b2;
      void b3;
    });

    it("skipCount 미지정이면 기존 동작 유지", async () => {
      await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });
      await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({ pageSize: 2, pageParam: 0 });
      expect(result.hasNextPage).toBe(true);
      expect(result.totalCount).toBe(3);
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

      const ids = await getResultIds({ libraryPath: ["/nonexistent"] });
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

  describe("handleGetNextBook / handleGetPrevBook - NULL 정렬 값 처리", () => {
    // 매 테스트마다 viewerExcludeCompleted 비활성화 (다른 describe의 mockReturnValue 잔영 방지)
    beforeEach(() => {
      vi.mocked(configStore.get).mockReturnValue(undefined);
    });

    // 아래 세 개는 "값 있는 책 → NULL 그룹" 방향의 경계다. 반대 방향(현재 책이
    // NULL 그룹)은 이미 분기가 있었지만 이쪽은 빠져 있어서 이동이 막혔다.
    it("artists asc: 작가 있는 첫 책의 prev → NULL 그룹의 마지막 책", async () => {
      // 정렬 순서(asc): nullA, nullB, withArtist
      await seedBook(db, { path: "/a" });
      const nullB = await seedBook(db, { path: "/b" });
      const withArtistBook = await seedBook(db, { path: "/c" });
      const artist = await seedArtist(db, "alpha");
      await linkBookArtist(db, withArtistBook.id, artist.id);

      const result = await handleGetPrevBook({
        currentBookId: withArtistBook.id,
        filter: { sortBy: "artists", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.prevBookId).toBe(nullB.id);
    });

    it("artists desc: 작가 있는 마지막 책의 next → NULL 그룹의 첫 책", async () => {
      // 정렬 순서(desc): withArtist, nullB, nullA (NULL 그룹은 id desc)
      await seedBook(db, { path: "/a" });
      const nullB = await seedBook(db, { path: "/b" });
      const withArtistBook = await seedBook(db, { path: "/c" });
      const artist = await seedArtist(db, "alpha");
      await linkBookArtist(db, withArtistBook.id, artist.id);

      const result = await handleGetNextBook({
        currentBookId: withArtistBook.id,
        mode: "next",
        filter: { sortBy: "artists", sortOrder: "desc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(nullB.id);
    });

    // hitomi_id는 CAST 비교라 분기가 따로 있는데, 같은 경계 결함을 그대로 갖고 있었다
    it("hitomi_id asc: 값 있는 첫 책의 prev → NULL 그룹의 마지막 책", async () => {
      // 정렬 순서(asc): nullA, nullB, id100, id300
      await seedBook(db, { path: "/a", hitomi_id: null });
      const nullB = await seedBook(db, { path: "/b", hitomi_id: null });
      const first = await seedBook(db, { path: "/c", hitomi_id: "100" });
      await seedBook(db, { path: "/d", hitomi_id: "300" });

      const result = await handleGetPrevBook({
        currentBookId: first.id,
        filter: { sortBy: "hitomi_id", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.prevBookId).toBe(nullB.id);
    });

    it("hitomi_id desc: 값 있는 마지막 책의 next → NULL 그룹의 첫 책", async () => {
      // 정렬 순서(desc): id300, id100, nullB, nullA
      await seedBook(db, { path: "/a", hitomi_id: null });
      const nullB = await seedBook(db, { path: "/b", hitomi_id: null });
      const last = await seedBook(db, { path: "/c", hitomi_id: "100" });
      await seedBook(db, { path: "/d", hitomi_id: "300" });

      const result = await handleGetNextBook({
        currentBookId: last.id,
        mode: "next",
        filter: { sortBy: "hitomi_id", sortOrder: "desc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(nullB.id);
    });

    it("last_read_at asc: 읽은 첫 책의 prev → 안 읽은 마지막 책", async () => {
      // artists뿐 아니라 NULL이 가능한 정렬 컬럼 전부가 같은 경계를 갖는다
      await seedBook(db, { path: "/a", last_read_at: null });
      const unreadB = await seedBook(db, { path: "/b", last_read_at: null });
      const readBook = await seedBook(db, {
        path: "/c",
        last_read_at: new Date("2024-01-01"),
      });

      const result = await handleGetPrevBook({
        currentBookId: readBook.id,
        filter: { sortBy: "last_read_at", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.prevBookId).toBe(unreadB.id);
    });

    it("artists(NULL) 책들 asc 정렬: 두 번째 NULL 책의 next → 작가 있는 첫 책", async () => {
      // 정렬 순서(asc): nullA, nullB(같은 NULL 그룹, id asc), withArtist
      await seedBook(db, { path: "/a" }); // NULL 그룹의 첫 책(컨텍스트)
      const nullB = await seedBook(db, { path: "/b" });
      const withArtistBook = await seedBook(db, { path: "/c" });
      const artist = await seedArtist(db, "alpha");
      await linkBookArtist(db, withArtistBook.id, artist.id);

      const result = await handleGetNextBook({
        currentBookId: nullB.id,
        mode: "next",
        filter: { sortBy: "artists", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(withArtistBook.id);
    });

    it("artists(NULL) 첫 책 asc 정렬: next → 같은 NULL 그룹의 다음 책", async () => {
      // 정렬 순서(asc): nullA, nullB (NULL 그룹 내 id asc)
      const nullA = await seedBook(db, { path: "/a" });
      const nullB = await seedBook(db, { path: "/b" });

      const result = await handleGetNextBook({
        currentBookId: nullA.id,
        mode: "next",
        filter: { sortBy: "artists", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(nullB.id);
    });

    it("artists(NULL) 두 번째 책 asc 정렬: prev → 첫 번째 NULL 책", async () => {
      const nullA = await seedBook(db, { path: "/a" });
      const nullB = await seedBook(db, { path: "/b" });

      const result = await handleGetPrevBook({
        currentBookId: nullB.id,
        filter: { sortBy: "artists", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.prevBookId).toBe(nullA.id);
    });

    it("artists(NULL) 첫 책 asc 정렬: prev → null (진짜 첫 번째)", async () => {
      const nullA = await seedBook(db, { path: "/a" });
      await seedBook(db, { path: "/b" });

      const result = await handleGetPrevBook({
        currentBookId: nullA.id,
        filter: { sortBy: "artists", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.prevBookId).toBeNull();
    });

    it("artists(NULL) desc 정렬: NULL 책들은 마지막 그룹, next는 같은 그룹 내 다음", async () => {
      // 정렬 순서(desc): 작가 있는 책들 먼저, 그 뒤 NULL 그룹(id desc)
      const nullA = await seedBook(db, { path: "/a" });
      const nullB = await seedBook(db, { path: "/b" });
      const withArtistBook = await seedBook(db, { path: "/c" });
      const artist = await seedArtist(db, "alpha");
      await linkBookArtist(db, withArtistBook.id, artist.id);

      // NULL 그룹 desc 순서: nullB(id 큰) → nullA. nullA의 next는 없어야(진짜 마지막).
      const nextFromNullB = await handleGetNextBook({
        currentBookId: nullB.id,
        mode: "next",
        filter: { sortBy: "artists", sortOrder: "desc" },
      });
      expect(nextFromNullB.nextBookId).toBe(nullA.id);

      const nextFromNullA = await handleGetNextBook({
        currentBookId: nullA.id,
        mode: "next",
        filter: { sortBy: "artists", sortOrder: "desc" },
      });
      expect(nextFromNullA.nextBookId).toBeNull();
    });

    it("작가 있는 책은 기존 동작 유지: asc 정렬 next → 다음 작가", async () => {
      // NULL 그룹 다음에 작가 있는 책들(artists asc)
      await seedBook(db, { path: "/a" }); // artists NULL
      const bookAlpha = await seedBook(db, { path: "/b" });
      const bookBeta = await seedBook(db, { path: "/c" });
      const a = await seedArtist(db, "alpha");
      const b = await seedArtist(db, "beta");
      await linkBookArtist(db, bookAlpha.id, a.id);
      await linkBookArtist(db, bookBeta.id, b.id);

      const result = await handleGetNextBook({
        currentBookId: bookAlpha.id,
        mode: "next",
        filter: { sortBy: "artists", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(bookBeta.id);
    });

    it("hitomi_id(NULL) asc 정렬: 첫 NULL 책의 next → 같은 NULL 그룹의 다음 책(값 있는 책으로 점프 X)", async () => {
      // asc 그리드 순서: nullA, nullB(NULL 그룹, id asc) → hitomiIdBook
      const nullA = await seedBook(db, { path: "/a", hitomi_id: null });
      const nullB = await seedBook(db, { path: "/b", hitomi_id: null });
      await seedBook(db, { path: "/c", hitomi_id: "100" }); // 값 있는 책(정렬 컨텍스트)

      const result = await handleGetNextBook({
        currentBookId: nullA.id,
        mode: "next",
        filter: { sortBy: "hitomi_id", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      // 핵심: 값 있는 책(100)으로 점프하지 않고 같은 NULL 그룹의 다음 책
      expect(result.nextBookId).toBe(nullB.id);
    });

    it("hitomi_id(NULL) asc 정렬: 마지막 NULL 책의 next → 값 있는 첫 책", async () => {
      await seedBook(db, { path: "/a", hitomi_id: null });
      const nullB = await seedBook(db, { path: "/b", hitomi_id: null });
      const hitomiIdBook = await seedBook(db, { path: "/c", hitomi_id: "100" });

      const result = await handleGetNextBook({
        currentBookId: nullB.id,
        mode: "next",
        filter: { sortBy: "hitomi_id", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(hitomiIdBook.id);
    });

    it("hitomi_id(NULL) desc 정렬: NULL 책들은 마지막 그룹, next는 같은 그룹 내 다음", async () => {
      // desc 그리드 순서: hitomiIdBook → nullB(id 큰) → nullA(id 작은)
      const nullA = await seedBook(db, { path: "/a", hitomi_id: null });
      const nullB = await seedBook(db, { path: "/b", hitomi_id: null });
      await seedBook(db, { path: "/c", hitomi_id: "100" });

      const nextFromNullB = await handleGetNextBook({
        currentBookId: nullB.id,
        mode: "next",
        filter: { sortBy: "hitomi_id", sortOrder: "desc" },
      });
      expect(nextFromNullB.nextBookId).toBe(nullA.id);

      const nextFromNullA = await handleGetNextBook({
        currentBookId: nullA.id,
        mode: "next",
        filter: { sortBy: "hitomi_id", sortOrder: "desc" },
      });
      expect(nextFromNullA.nextBookId).toBeNull();
    });

    it("hitomi_id 값 있는 책은 기존 동작 유지: asc 정렬 next → 다음 ID", async () => {
      await seedBook(db, { path: "/a", hitomi_id: null }); // NULL 그룹
      const low = await seedBook(db, { path: "/b", hitomi_id: "100" });
      const high = await seedBook(db, { path: "/c", hitomi_id: "200" });

      const result = await handleGetNextBook({
        currentBookId: low.id,
        mode: "next",
        filter: { sortBy: "hitomi_id", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(high.id);
    });

    it("page_count(NULL) asc 정렬: NULL 책 next → 같은 NULL 그룹 다음 책(일반 분기 NULL 처리)", async () => {
      // asc 그리드 순서: nullA, nullB(NULL 그룹) → pageBook
      const nullA = await seedBook(db, { path: "/a", page_count: null });
      const nullB = await seedBook(db, { path: "/b", page_count: null });
      const pageBook = await seedBook(db, { path: "/c", page_count: 10 });

      const nextFromNullA = await handleGetNextBook({
        currentBookId: nullA.id,
        mode: "next",
        filter: { sortBy: "page_count", sortOrder: "asc" },
      });
      expect(nextFromNullA.nextBookId).toBe(nullB.id);

      const nextFromNullB = await handleGetNextBook({
        currentBookId: nullB.id,
        mode: "next",
        filter: { sortBy: "page_count", sortOrder: "asc" },
      });
      expect(nextFromNullB.nextBookId).toBe(pageBook.id);
    });
  });

  describe("file_mtime 정렬 (파일 수정 날짜)", () => {
    // 다른 describe의 mockReturnValue 잔영 방지
    beforeEach(() => {
      vi.mocked(configStore.get).mockReturnValue(undefined);
    });

    it("desc 정렬: mtime 큰 책부터, NULL 책은 맨 뒤", async () => {
      const oldBook = await seedBook(db, { path: "/a", file_mtime: 1000 });
      const newBook = await seedBook(db, { path: "/b", file_mtime: 2000 });
      const nullBook = await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({
        sortBy: "file_mtime",
        sortOrder: "desc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([newBook.id, oldBook.id, nullBook.id]);
    });

    it("asc 정렬: NULL 책이 맨 앞, 이후 mtime 오름차순", async () => {
      const oldBook = await seedBook(db, { path: "/a", file_mtime: 1000 });
      const newBook = await seedBook(db, { path: "/b", file_mtime: 2000 });
      const nullBook = await seedBook(db, { path: "/c" });

      const result = await handleGetBooks({
        sortBy: "file_mtime",
        sortOrder: "asc",
        pageSize: 1000,
      });
      const ids = result.data.map((b: { id: number }) => b.id);
      expect(ids).toEqual([nullBook.id, oldBook.id, newBook.id]);
    });

    it("next(desc): 값 있는 책 사이 이동 (mtime 큰 책 → 작은 책)", async () => {
      const oldBook = await seedBook(db, { path: "/a", file_mtime: 1000 });
      const newBook = await seedBook(db, { path: "/b", file_mtime: 2000 });

      const result = await handleGetNextBook({
        currentBookId: newBook.id,
        mode: "next",
        filter: { sortBy: "file_mtime", sortOrder: "desc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(oldBook.id);
    });

    it("prev(desc): 값 있는 책 사이 복귀 (mtime 작은 책 → 큰 책)", async () => {
      const oldBook = await seedBook(db, { path: "/a", file_mtime: 1000 });
      const newBook = await seedBook(db, { path: "/b", file_mtime: 2000 });

      const result = await handleGetPrevBook({
        currentBookId: oldBook.id,
        filter: { sortBy: "file_mtime", sortOrder: "desc" },
      });

      expect(result.success).toBe(true);
      expect(result.prevBookId).toBe(newBook.id);
    });

    it("next(asc): NULL 그룹 마지막 책 → 값 있는 첫 책으로 이동", async () => {
      await seedBook(db, { path: "/a" }); // NULL 그룹의 첫 책(컨텍스트)
      const nullB = await seedBook(db, { path: "/b" });
      const withMtime = await seedBook(db, { path: "/c", file_mtime: 1000 });

      const result = await handleGetNextBook({
        currentBookId: nullB.id,
        mode: "next",
        filter: { sortBy: "file_mtime", sortOrder: "asc" },
      });

      expect(result.success).toBe(true);
      expect(result.nextBookId).toBe(withMtime.id);
    });
  });

  describe("랜덤 정렬 (시드 셔플)", () => {
    // getResultIds는 sort()로 순서를 지우므로, 정렬 순서를 보존하는 별도 헬퍼 사용
    async function getOrderedIds(
      params: FilterParams & { pageParam?: number; pageSize?: number },
    ): Promise<number[]> {
      const result = await handleGetBooks({ pageSize: 1000, ...params });
      return result.data.map((b: { id: number }) => b.id);
    }

    it("같은 시드 → 항상 같은 순서", async () => {
      for (let i = 0; i < 20; i++) {
        await seedBook(db, { path: `/book-${i}` });
      }
      const first = await getOrderedIds({
        sortBy: "random",
        randomSeed: 12345,
      });
      const second = await getOrderedIds({
        sortBy: "random",
        randomSeed: 12345,
      });
      expect(first).toHaveLength(20);
      expect(second).toEqual(first);
    });

    it("다른 시드 → 다른 순서", async () => {
      for (let i = 0; i < 20; i++) {
        await seedBook(db, { path: `/book-${i}` });
      }
      const a = await getOrderedIds({ sortBy: "random", randomSeed: 12345 });
      const b = await getOrderedIds({
        sortBy: "random",
        randomSeed: 987654321,
      });
      expect(b).not.toEqual(a);
    });

    it("페이지 조각을 이어붙이면 전체 순서와 일치 (중복/누락 없음)", async () => {
      for (let i = 0; i < 25; i++) {
        await seedBook(db, { path: `/book-${i}` });
      }
      const full = await getOrderedIds({ sortBy: "random", randomSeed: 555 });
      const paged: number[] = [];
      for (let page = 0; page < 5; page++) {
        const result = await handleGetBooks({
          sortBy: "random",
          randomSeed: 555,
          pageParam: page,
          pageSize: 5,
        });
        paged.push(...result.data.map((b: { id: number }) => b.id));
      }
      expect(paged).toEqual(full);
      expect(new Set(paged).size).toBe(25);
    });

    it("시드 없음 → RANDOM() 폴백으로 전체 반환", async () => {
      for (let i = 0; i < 10; i++) {
        await seedBook(db, { path: `/book-${i}` });
      }
      const ids = await getOrderedIds({ sortBy: "random" });
      expect(ids).toHaveLength(10);
    });

    it("유효하지 않은 시드(소수/음수/범위 초과) → 폴백으로 전체 반환", async () => {
      for (let i = 0; i < 10; i++) {
        await seedBook(db, { path: `/book-${i}` });
      }
      for (const bad of [1.5, -1, 2 ** 30]) {
        const ids = await getOrderedIds({ sortBy: "random", randomSeed: bad });
        expect(ids).toHaveLength(10);
      }
    });
  });

  describe("handleGetNextBook / handleGetPrevBook - 시드 랜덤 정렬", () => {
    // viewerExcludeCompleted 등 config 잔영 방지
    beforeEach(() => {
      vi.mocked(configStore.get).mockReturnValue(undefined);
    });

    const SEED = 424242;

    async function seedBooksAndGetOrder(count: number): Promise<number[]> {
      for (let i = 0; i < count; i++) {
        await seedBook(db, { path: `/book-${i}` });
      }
      const result = await handleGetBooks({
        sortBy: "random",
        randomSeed: SEED,
        pageSize: 1000,
      });
      return result.data.map((b: { id: number }) => b.id);
    }

    it("next가 getBooks의 시드 순서를 그대로 따라감", async () => {
      const order = await seedBooksAndGetOrder(15);
      for (let i = 0; i < order.length - 1; i++) {
        const result = await handleGetNextBook({
          currentBookId: order[i],
          mode: "next",
          filter: { sortBy: "random", randomSeed: SEED },
        });
        expect(result.success).toBe(true);
        expect(result.nextBookId).toBe(order[i + 1]);
      }
    });

    it("prev가 시드 순서의 역방향을 그대로 따라감", async () => {
      const order = await seedBooksAndGetOrder(15);
      for (let i = 1; i < order.length; i++) {
        const result = await handleGetPrevBook({
          currentBookId: order[i],
          filter: { sortBy: "random", randomSeed: SEED },
        });
        expect(result.success).toBe(true);
        expect(result.prevBookId).toBe(order[i - 1]);
      }
    });

    it("마지막 책의 next → null, 첫 책의 prev → null", async () => {
      const order = await seedBooksAndGetOrder(5);
      const next = await handleGetNextBook({
        currentBookId: order[order.length - 1],
        mode: "next",
        filter: { sortBy: "random", randomSeed: SEED },
      });
      expect(next.success).toBe(true);
      expect(next.nextBookId).toBeNull();

      const prev = await handleGetPrevBook({
        currentBookId: order[0],
        filter: { sortBy: "random", randomSeed: SEED },
      });
      expect(prev.success).toBe(true);
      expect(prev.prevBookId).toBeNull();
    });

    it("mode:'random'은 시드를 무시하고 현재 책이 아닌 책 반환", async () => {
      const order = await seedBooksAndGetOrder(5);
      const result = await handleGetNextBook({
        currentBookId: order[0],
        mode: "random",
        filter: { sortBy: "random", randomSeed: SEED },
      });
      expect(result.success).toBe(true);
      expect(result.nextBookId).not.toBeNull();
      expect(result.nextBookId).not.toBe(order[0]);
    });

    it("시드 없는 랜덤 정렬 next → 완전 랜덤 폴백 (현재 책이 아닌 책 반환)", async () => {
      const order = await seedBooksAndGetOrder(5);
      const result = await handleGetNextBook({
        currentBookId: order[0],
        mode: "next",
        filter: { sortBy: "random" },
      });
      expect(result.success).toBe(true);
      expect(result.nextBookId).not.toBeNull();
      expect(result.nextBookId).not.toBe(order[0]);
    });
  });
});

describe("handleCheckBooksExistByHitomiIds", () => {
  let batchDb: Knex;

  beforeAll(async () => {
    batchDb = await createTestDb();
    dbRef.current = batchDb;
  });

  beforeEach(async () => {
    dbRef.current = batchDb;
    await truncateAll(batchDb);
  });

  afterAll(async () => {
    await batchDb.destroy();
  });

  it("빈 배열은 빈 맵을 반환한다", async () => {
    const result = await handleCheckBooksExistByHitomiIds([]);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it("문자열로 저장된 hitomi_id와 숫자 입력이 매칭된다", async () => {
    const book = await seedBook(batchDb, { path: "/a", hitomi_id: "12345" });

    const result = await handleCheckBooksExistByHitomiIds([12345]);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ 12345: book.id });
  });

  it("보유하지 않은 ID는 키 자체가 없다", async () => {
    await seedBook(batchDb, { path: "/a", hitomi_id: "111" });

    const result = await handleCheckBooksExistByHitomiIds([111, 222]);

    expect(result.data).toHaveProperty("111");
    expect(result.data).not.toHaveProperty("222");
  });

  it("여러 ID를 한 번에 조회한다", async () => {
    const a = await seedBook(batchDb, { path: "/a", hitomi_id: "100" });
    const b = await seedBook(batchDb, { path: "/b", hitomi_id: "200" });
    await seedBook(batchDb, { path: "/c", hitomi_id: null });

    const result = await handleCheckBooksExistByHitomiIds([100, 200, 300]);

    expect(result.data).toEqual({ 100: a.id, 200: b.id });
  });

  it("같은 hitomi_id가 중복 저장돼 있으면 가장 오래된 책을 돌려준다", async () => {
    // 단건 핸들러의 .first()와 결과가 어긋나면 안 됩니다
    const first = await seedBook(batchDb, { path: "/a", hitomi_id: "777" });
    await seedBook(batchDb, { path: "/b", hitomi_id: "777" });

    const result = await handleCheckBooksExistByHitomiIds([777]);

    expect(result.data).toEqual({ 777: first.id });
  });

  it("입력에 중복 ID가 있어도 정상 동작한다", async () => {
    const book = await seedBook(batchDb, { path: "/a", hitomi_id: "555" });

    const result = await handleCheckBooksExistByHitomiIds([555, 555, 555]);

    expect(result.data).toEqual({ 555: book.id });
  });

  it("SQLite 바인딩 상한을 넘는 개수도 청크로 나눠 처리한다", async () => {
    const book = await seedBook(batchDb, { path: "/a", hitomi_id: "999999" });
    // 청크 크기(500)를 넉넉히 넘기는 입력
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
    ids.push(999999);

    const result = await handleCheckBooksExistByHitomiIds(ids);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ 999999: book.id });
  });
});

describe("별점", () => {
  let ratingDb: Knex;

  beforeAll(async () => {
    ratingDb = await createTestDb();
    dbRef.current = ratingDb;
  });

  beforeEach(async () => {
    dbRef.current = ratingDb;
    await truncateAll(ratingDb);
  });

  afterAll(async () => {
    await ratingDb.destroy();
  });

  it("새 책의 별점 기본값은 미평가(0)다", async () => {
    const book = await seedBook(ratingDb, { path: "/a" });
    const row = await ratingDb("Book").where("id", book.id).first();
    expect(row.rating).toBe(0);
  });

  it("별점을 저장하고 저장된 값을 돌려준다", async () => {
    const book = await seedBook(ratingDb, { path: "/a" });

    const result = await handleSetBookRating({ bookId: book.id, rating: 4 });

    expect(result).toEqual({ success: true, rating: 4 });
    const row = await ratingDb("Book").where("id", book.id).first();
    expect(row.rating).toBe(4);
  });

  it("범위를 벗어난 값은 잘라서 저장한다", async () => {
    const book = await seedBook(ratingDb, { path: "/a" });

    const result = await handleSetBookRating({ bookId: book.id, rating: 99 });

    expect(result.rating).toBe(5);
    const row = await ratingDb("Book").where("id", book.id).first();
    expect(row.rating).toBe(5);
  });

  it("0을 주면 평가가 해제된다", async () => {
    const book = await seedBook(ratingDb, { path: "/a", rating: 5 });

    await handleSetBookRating({ bookId: book.id, rating: 0 });

    const row = await ratingDb("Book").where("id", book.id).first();
    expect(row.rating).toBe(0);
  });

  it("응답에 rating이 실려 온다", async () => {
    await seedBook(ratingDb, { path: "/a", rating: 3 });

    const result = await handleGetBooks({ pageSize: 1000 });

    expect(result.data[0].rating).toBe(3);
  });

  it("sortBy=rating, sortOrder=desc → 높은 별점 순", async () => {
    const low = await seedBook(ratingDb, { path: "/a", rating: 1 });
    const high = await seedBook(ratingDb, { path: "/b", rating: 5 });
    const mid = await seedBook(ratingDb, { path: "/c", rating: 3 });

    const result = await handleGetBooks({
      sortBy: "rating",
      sortOrder: "desc",
      pageSize: 1000,
    });

    expect(result.data.map((b: { id: number }) => b.id)).toEqual([
      high.id,
      mid.id,
      low.id,
    ]);
  });

  it("미평가(0)는 내림차순에서 맨 뒤로 간다", async () => {
    const unrated = await seedBook(ratingDb, { path: "/a" });
    const rated = await seedBook(ratingDb, { path: "/b", rating: 2 });

    const result = await handleGetBooks({
      sortBy: "rating",
      sortOrder: "desc",
      pageSize: 1000,
    });

    expect(result.data.map((b: { id: number }) => b.id)).toEqual([
      rated.id,
      unrated.id,
    ]);
  });
});
