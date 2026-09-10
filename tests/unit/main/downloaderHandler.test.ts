import { beforeEach, describe, expect, it, vi } from "vitest";

// galleries.list에 실제로 전달된 옵션을 검사하기 위한 스파이
const mockGalleryList = vi.fn();

// 클라이언트 부분 모킹: 태그 파싱은 진짜를 쓰고 검색만 대체한다.
// tags.parse와 tags.create는 네트워크를 타지 않는다.
vi.mock("../../../src/main/services/hitomi/client.js", async () => {
  const { hitomi } = await import("node-hitomi");
  return {
    hitomi: {
      galleries: { list: (...args: unknown[]) => mockGalleryList(...args) },
      tags: hitomi.tags,
    },
  };
});

/** galleries.list는 ID가 아니라 참조 객체를 돌려준다 */
const toReferences = (ids: number[]) => ids.map((id) => ({ id }));

// console은 main.ts에서 export된다 (기존 테스트 패턴).
// vi.mock 팩토리는 hoist되지만 실제 호출은 import 시점이라 위 const를 참조해도 안전하다.
const mockConsoleWarn = vi.fn();
vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), warn: mockConsoleWarn, error: vi.fn() },
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/mock/userData") },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

// 설정 저장소 모킹
const mockConfigGet = vi.fn();
vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: { get: mockConfigGet },
}));

// 스캔 로직은 검색과 무관하므로 통째로 대체
vi.mock("../../../src/main/handlers/directoryHandler.js", () => ({
  scanFile: vi.fn(),
}));

vi.mock("../../../src/main/db/index.js", () => ({ default: vi.fn() }));

// 정적 import를 쓰면 위 const들이 초기화되기 전에 mock 팩토리가 실행되어
// TDZ 에러가 난다. 기존 테스트(presetHandler.test.ts:98)와 같은 방식으로
// const 선언 뒤에서 동적으로 가져온다.
const { __clearIdCache, handleSearchGalleries } =
  await import("../../../src/main/handlers/downloaderHandler.js");

describe("handleSearchGalleries — 음성 태그", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearIdCache();
    mockGalleryList.mockResolvedValue(toReferences([101, 102, 103]));
    // 블랙리스트 기본값은 빈 배열
    mockConfigGet.mockImplementation((key: string, fallback: unknown) =>
      key === "downloaderBlacklistTags" ? [] : fallback,
    );
  });

  it("음성 태그만 검색해도 예외 없이 성공한다", async () => {
    const result = await handleSearchGalleries({
      searchQuery: "-male:yaoi",
    });

    expect(result.success).toBe(true);
  });

  it("양성·음성 태그를 그대로 넘긴다", async () => {
    await handleSearchGalleries({
      searchQuery: "language:korean -male:yaoi",
    });

    const options = mockGalleryList.mock.calls[0][0];
    expect(options.tags).toHaveLength(2);
    expect(options.tags[0].isNegative).toBe(false);
    expect(options.tags[1].isNegative).toBe(true);
  });

  it("태그가 없으면 tags를 넘기지 않는다", async () => {
    await handleSearchGalleries({ searchQuery: "" });

    const options = mockGalleryList.mock.calls[0][0];
    expect(options.tags).toBeUndefined();
  });
});

describe("블랙리스트 주입", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearIdCache();
    mockGalleryList.mockResolvedValue(toReferences([101, 102, 103]));
  });

  const withBlacklist = (list: string[]) => {
    mockConfigGet.mockImplementation((key: string, fallback: unknown) =>
      key === "downloaderBlacklistTags" ? list : fallback,
    );
  };

  it("블랙리스트 태그를 음성 태그로 주입한다", async () => {
    withBlacklist(["male:yaoi"]);

    await handleSearchGalleries({
      searchQuery: "language:korean",
    });

    const { tags } = mockGalleryList.mock.calls[0][0];
    expect(tags).toContainEqual(
      expect.objectContaining({ type: "male", name: "yaoi", isNegative: true }),
    );
  });

  it("검색어에 이미 있는 태그는 중복 주입하지 않는다", async () => {
    withBlacklist(["male:yaoi"]);

    await handleSearchGalleries({
      searchQuery: "language:korean -male:yaoi",
    });

    const { tags } = mockGalleryList.mock.calls[0][0];
    const yaoi = tags.filter(
      (t: { type: string; name: string }) =>
        t.type === "male" && t.name === "yaoi",
    );
    expect(yaoi).toHaveLength(1);
  });

  it("밑줄과 공백을 같은 태그로 본다", async () => {
    // getParsedTags가 이름의 _를 공백으로 정규화하므로
    // big_breasts(검색어)와 big_breasts(블랙리스트)는 둘 다 "big breasts"가 된다
    withBlacklist(["female:big_breasts"]);

    await handleSearchGalleries({
      searchQuery: "female:big_breasts",
    });

    const { tags } = mockGalleryList.mock.calls[0][0];
    const big = tags.filter(
      (t: { type: string; name: string }) =>
        t.type === "female" && t.name === "big breasts",
    );
    expect(big).toHaveLength(1);
    // 명시 검색이 블랙리스트를 이긴다 (설계 D9)
    expect(big[0].isNegative).toBe(false);
  });

  it("손상된 항목 하나가 나머지 블랙리스트를 무력화하지 않는다", async () => {
    withBlacklist(["male:yaoi", "한글:태그", "female:guro"]);

    await handleSearchGalleries({
      searchQuery: "language:korean",
    });

    const { tags } = mockGalleryList.mock.calls[0][0];
    expect(tags).toContainEqual(
      expect.objectContaining({ type: "male", name: "yaoi", isNegative: true }),
    );
    expect(tags).toContainEqual(
      expect.objectContaining({
        type: "female",
        name: "guro",
        isNegative: true,
      }),
    );
  });

  it("블랙리스트가 비어 있으면 경고를 남기지 않는다", async () => {
    // [].join(" ")를 getParsedTags에 넘기면 예외가 난다.
    // 기본값이 []이므로 가드가 없으면 전 유저가 매 검색마다 경고를 찍는다.
    withBlacklist([]);

    await handleSearchGalleries({
      searchQuery: "language:korean",
    });

    expect(mockConsoleWarn).not.toHaveBeenCalled();
  });

  it("id: 검색은 블랙리스트를 타지 않는다", async () => {
    withBlacklist(["male:yaoi"]);

    const result = await handleSearchGalleries({
      searchQuery: "id:12345",
    });

    expect(result.data).toEqual([12345]);
    expect(mockGalleryList).not.toHaveBeenCalled();
  });

  it("프리픽스 없는 숫자도 id: 검색과 똑같이 블랙리스트를 타지 않는다", async () => {
    withBlacklist(["male:yaoi"]);

    const result = await handleSearchGalleries({
      searchQuery: "12345",
    });

    expect(result.data).toEqual([12345]);
    expect(mockGalleryList).not.toHaveBeenCalled();
  });

  it("숫자가 섞인 낱말은 ID로 보지 않는다", async () => {
    mockGalleryList.mockResolvedValue(toReferences([1, 2]));

    const result = await handleSearchGalleries({ searchQuery: "12345화" });

    expect(result.data).toEqual([1, 2]);
    expect(mockGalleryList).toHaveBeenCalled();
  });
});

describe("ID 캐시", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    __clearIdCache();
    mockGalleryList.mockResolvedValue(toReferences([101, 102, 103]));
    mockConfigGet.mockImplementation((key: string, fallback: unknown) =>
      key === "downloaderBlacklistTags" ? [] : fallback,
    );
  });

  it("같은 검색어를 다시 요청하면 히토미를 다시 조회하지 않는다", async () => {
    const args = { searchQuery: "language:korean" };

    await handleSearchGalleries(args);
    await handleSearchGalleries(args);

    expect(mockGalleryList).toHaveBeenCalledTimes(1);
  });

  it("대소문자가 다른 검색어는 캐시 키가 갈린다", async () => {
    // getParsedTags는 대문자를 거부하므로 artist:Foo는 실패해야 한다.
    // 캐시 키를 소문자화하면 artist:foo의 성공 결과에 얹혀 성공한 것처럼 보인다.
    const ok = await handleSearchGalleries({
      searchQuery: "artist:foo",
    });
    const bad = await handleSearchGalleries({
      searchQuery: "artist:Foo",
    });

    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it("TTL이 지나면 다시 조회하고 generation이 증가한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T00:00:00Z"));

    const args = { searchQuery: "language:korean" };
    const first = await handleSearchGalleries(args);

    vi.setSystemTime(new Date("2026-08-10T00:06:00Z")); // TTL 5분 초과
    const second = await handleSearchGalleries(args);

    expect(mockGalleryList).toHaveBeenCalledTimes(2);
    expect(second.generation).toBeGreaterThan(first.generation!);

    vi.useRealTimers();
  });

  it("블랙리스트가 다르면 캐시 키가 갈린다", async () => {
    const args = { searchQuery: "language:korean" };

    mockConfigGet.mockImplementation((key: string, fallback: unknown) =>
      key === "downloaderBlacklistTags" ? [] : fallback,
    );
    await handleSearchGalleries(args);

    mockConfigGet.mockImplementation((key: string, fallback: unknown) =>
      key === "downloaderBlacklistTags" ? ["male:yaoi"] : fallback,
    );
    await handleSearchGalleries(args);

    expect(mockGalleryList).toHaveBeenCalledTimes(2);
  });

  it("언어 '전체'의 실측 규모(약 120만 건)도 캐시된다", async () => {
    // 실측(2026-08-11): 언어 "전체 언어" + 빈 검색어 = 1,191,155건.
    // 상한이 50만이던 시절에는 하필 이 케이스만 캐시에서 빠져서,
    // 인덱스를 다시 받는 비용이 가장 큰 검색이 매번 전량 재요청을 했다.
    const measured = Array.from({ length: 1_191_155 }, (_, i) => ({
      id: i + 1,
    }));
    mockGalleryList.mockResolvedValue(measured);

    const args = { searchQuery: "" };
    await handleSearchGalleries(args);
    await handleSearchGalleries(args);

    expect(mockGalleryList).toHaveBeenCalledTimes(1);
  });

  it("결과가 상한을 넘으면 캐시하지 않는다", async () => {
    const huge = Array.from({ length: 2_000_001 }, (_, i) => ({ id: i + 1 }));
    mockGalleryList.mockResolvedValue(huge);

    const args = { searchQuery: "language:korean" };
    await handleSearchGalleries(args);
    await handleSearchGalleries(args);

    expect(mockGalleryList).toHaveBeenCalledTimes(2);
  });
});

describe("구간 기반 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearIdCache();
    mockConfigGet.mockImplementation((key: string, fallback: unknown) =>
      key === "downloaderBlacklistTags" ? [] : fallback,
    );
  });

  it("총 건수를 반환한다", async () => {
    mockGalleryList.mockResolvedValue(
      Array.from({ length: 1234 }, (_, i) => ({ id: i + 1 })),
    );

    const result = await handleSearchGalleries({
      searchQuery: "language:korean",
    });

    expect(result.total).toBe(1234);
  });

  it("요청한 구간만 잘라 반환한다", async () => {
    mockGalleryList.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
    );

    const result = await handleSearchGalleries({
      searchQuery: "language:korean",
      start: 30,
      count: 10,
    });

    expect(result.data).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
  });

  it("구간이 끝을 넘어가면 남은 만큼만 반환한다", async () => {
    mockGalleryList.mockResolvedValue(toReferences([1, 2, 3]));

    const result = await handleSearchGalleries({
      searchQuery: "language:korean",
      start: 2,
      count: 30,
    });

    expect(result.data).toEqual([3]);
    expect(result.total).toBe(3);
  });

  it("id: 검색도 total을 반환한다", async () => {
    // 안 넣으면 3단계에서 가상 스크롤러 아이템 수가 undefined가 된다
    const result = await handleSearchGalleries({ searchQuery: "id:12345" });

    expect(result.data).toEqual([12345]);
    expect(result.total).toBe(1);
  });
});

describe("인기 필터", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearIdCache();
    mockGalleryList.mockResolvedValue(toReferences([101, 102]));
    mockConfigGet.mockImplementation((key: string, fallback: unknown) =>
      key === "downloaderBlacklistTags" ? [] : fallback,
    );
  });

  it("popularityOrderBy를 orderBy로 옮긴다", async () => {
    await handleSearchGalleries({
      searchQuery: "language:korean",
      popularityOrderBy: "week",
    });

    const options = mockGalleryList.mock.calls[0][0];
    expect(options.orderBy).toBe("week");
  });

  it("day는 라이브러리의 today로 옮긴다", async () => {
    await handleSearchGalleries({
      searchQuery: "language:korean",
      popularityOrderBy: "day",
    });

    const options = mockGalleryList.mock.calls[0][0];
    expect(options.orderBy).toBe("today");
  });

  it("인기 필터가 다르면 캐시 키가 갈린다", async () => {
    await handleSearchGalleries({ searchQuery: "language:korean" });
    await handleSearchGalleries({
      searchQuery: "language:korean",
      popularityOrderBy: "week",
    });

    expect(mockGalleryList).toHaveBeenCalledTimes(2);
  });

  it("빈 문자열이면 orderBy를 넘기지 않는다", async () => {
    await handleSearchGalleries({
      searchQuery: "language:korean",
      popularityOrderBy: "",
    });

    const options = mockGalleryList.mock.calls[0][0];
    expect(options.orderBy).toBeUndefined();
  });
});
