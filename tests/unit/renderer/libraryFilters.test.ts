import { describe, expect, it } from "vitest";
import {
  activeFilters,
  hasActiveFilters,
  libraryPathLabel,
  normalizeReadStatus,
  LIBRARY_FILTER_DEFAULTS,
  type LibraryFilterState,
} from "../../../src/renderer/lib/libraryFilters";

const state = (over: Partial<LibraryFilterState> = {}): LibraryFilterState => ({
  ...LIBRARY_FILTER_DEFAULTS,
  ...over,
});

describe("activeFilters", () => {
  it("기본 상태에서는 아무것도 걸리지 않는다", () => {
    expect(activeFilters(state())).toEqual([]);
    expect(hasActiveFilters(state())).toBe(false);
  });

  it("검색어가 있으면 검색 칩", () => {
    expect(activeFilters(state({ searchQuery: "artist:yanje" }))).toEqual([
      { key: "searchQuery", label: "검색: artist:yanje" },
    ]);
  });

  // 검색창을 지웠는데 공백이 남는 경우가 흔하다. 이걸 걸린 것으로 보면
  // 아무것도 안 걸렸는데 "필터 적용중"이 뜬다.
  it("공백뿐인 검색어는 걸린 것으로 보지 않는다", () => {
    expect(hasActiveFilters(state({ searchQuery: "   " }))).toBe(false);
  });

  it("검색어 앞뒤 공백은 라벨에서 제거된다", () => {
    expect(activeFilters(state({ searchQuery: "  nurse  " }))[0].label).toBe(
      "검색: nurse",
    );
  });

  it("라이브러리 폴더는 마지막 폴더명만 보여준다", () => {
    expect(activeFilters(state({ libraryPath: "D:\\books\\만화" }))).toEqual([
      { key: "libraryPath", label: "폴더: 만화" },
    ]);
  });

  it("읽음 상태 필터", () => {
    expect(activeFilters(state({ readStatus: "unread" }))).toEqual([
      { key: "readStatus", label: "안 읽음" },
    ]);
    expect(activeFilters(state({ readStatus: "reading" }))).toEqual([
      { key: "readStatus", label: "읽는 중" },
    ]);
    expect(activeFilters(state({ readStatus: "completed" }))).toEqual([
      { key: "readStatus", label: "완독" },
    ]);
  });

  it("즐겨찾기 필터", () => {
    expect(activeFilters(state({ isFavorite: "favorite" }))).toEqual([
      { key: "isFavorite", label: "즐겨찾기만" },
    ]);
  });

  it("오프라인 상태 필터", () => {
    expect(activeFilters(state({ offlineStatus: "offline" }))).toEqual([
      { key: "offlineStatus", label: "오프라인만" },
    ]);
  });

  it("여러 개가 걸리면 표시 순서대로 모두 나온다", () => {
    const result = activeFilters(
      state({
        searchQuery: "nurse",
        readStatus: "completed",
        isFavorite: "favorite",
      }),
    );
    expect(result.map((f) => f.key)).toEqual([
      "searchQuery",
      "readStatus",
      "isFavorite",
    ]);
    expect(hasActiveFilters(state({ readStatus: "completed" }))).toBe(true);
  });
});

describe("normalizeReadStatus", () => {
  it("유효한 값은 그대로 통과한다", () => {
    expect(normalizeReadStatus("all")).toBe("all");
    expect(normalizeReadStatus("unread")).toBe("unread");
    expect(normalizeReadStatus("reading")).toBe("reading");
    expect(normalizeReadStatus("completed")).toBe("completed");
  });

  // 구버전의 `read`는 대응하는 구간이 없다. 그대로 두면 라디오 그룹 어디에도
  // 걸리지 않아 드롭다운이 빈 상태로 보인다.
  it("구버전 read와 알 수 없는 값은 all로 떨어진다", () => {
    expect(normalizeReadStatus("read")).toBe("all");
    expect(normalizeReadStatus("")).toBe("all");
    expect(normalizeReadStatus(undefined)).toBe("all");
    expect(normalizeReadStatus(null)).toBe("all");
    expect(normalizeReadStatus(["unread"])).toBe("all");
  });
});

describe("libraryPathLabel", () => {
  it("윈도우 경로", () => {
    expect(libraryPathLabel("D:\\books\\manga")).toBe("manga");
  });

  it("POSIX 경로", () => {
    expect(libraryPathLabel("/home/user/books")).toBe("books");
  });

  it("끝에 구분자가 붙어도 폴더명을 찾는다", () => {
    expect(libraryPathLabel("D:\\books\\manga\\")).toBe("manga");
  });

  it("구분자가 없으면 그대로", () => {
    expect(libraryPathLabel("manga")).toBe("manga");
  });
});
