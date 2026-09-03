import { describe, expect, it } from "vitest";
import {
  activeFilters,
  hasActiveFilters,
  joinFilterValues,
  libraryPathLabel,
  normalizeReadStatus,
  parseFilterChipKey,
  parseLibraryPaths,
  parseReadStatuses,
  toggleFilterValue,
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
      { key: "libraryPath:D:\\books\\만화", label: "폴더: 만화" },
    ]);
  });

  it("읽음 상태 필터", () => {
    expect(activeFilters(state({ readStatus: "unread" }))).toEqual([
      { key: "readStatus:unread", label: "안 읽음" },
    ]);
    expect(activeFilters(state({ readStatus: "reading" }))).toEqual([
      { key: "readStatus:reading", label: "읽는 중" },
    ]);
    expect(activeFilters(state({ readStatus: "completed" }))).toEqual([
      { key: "readStatus:completed", label: "완독" },
    ]);
  });

  // 다중 선택은 값마다 칩 하나다. 칩 하나를 눌러 그 값만 뺄 수 있어야 한다
  it("읽음 상태를 여러 개 고르면 값마다 칩이 하나씩", () => {
    expect(activeFilters(state({ readStatus: "unread|reading" }))).toEqual([
      { key: "readStatus:unread", label: "안 읽음" },
      { key: "readStatus:reading", label: "읽는 중" },
    ]);
  });

  it("라이브러리 폴더를 여러 개 고르면 값마다 칩이 하나씩", () => {
    expect(
      activeFilters(state({ libraryPath: "D:\\books\\만화|E:\\comics" })),
    ).toEqual([
      { key: "libraryPath:D:\\books\\만화", label: "폴더: 만화" },
      { key: "libraryPath:E:\\comics", label: "폴더: comics" },
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
      "readStatus:completed",
      "isFavorite",
    ]);
    expect(hasActiveFilters(state({ readStatus: "completed" }))).toBe(true);
  });
});

describe("parseReadStatuses", () => {
  it("all과 빈 값은 조건 없음", () => {
    expect(parseReadStatuses("all")).toEqual([]);
    expect(parseReadStatuses("")).toEqual([]);
    expect(parseReadStatuses(undefined)).toEqual([]);
    expect(parseReadStatuses(null)).toEqual([]);
    expect(parseReadStatuses(["unread"])).toEqual([]);
  });

  it("하나만 고른 값", () => {
    expect(parseReadStatuses("unread")).toEqual(["unread"]);
  });

  it("여러 개는 구분자로 이어진다", () => {
    expect(parseReadStatuses("unread|reading")).toEqual(["unread", "reading"]);
  });

  // 구버전 설정의 `read`처럼 대응 구간이 없는 값이 섞여 들어와도
  // 나머지 선택까지 통째로 버리면 안 된다
  it("알 수 없는 값만 걸러내고 나머지는 살린다", () => {
    expect(parseReadStatuses("unread|read|completed")).toEqual([
      "unread",
      "completed",
    ]);
    expect(parseReadStatuses("read")).toEqual([]);
  });

  it("중복은 한 번만 남는다", () => {
    expect(parseReadStatuses("unread|unread")).toEqual(["unread"]);
  });
});

describe("parseLibraryPaths", () => {
  it("all과 빈 값은 조건 없음", () => {
    expect(parseLibraryPaths("all")).toEqual([]);
    expect(parseLibraryPaths("")).toEqual([]);
    expect(parseLibraryPaths(undefined)).toEqual([]);
  });

  it("경로 하나", () => {
    expect(parseLibraryPaths("D:\\books")).toEqual(["D:\\books"]);
  });

  // 구분자로 `|`를 쓰는 이유: 윈도우 경로에 들어갈 수 없는 문자라
  // 폴더 이름과 충돌하지 않는다
  it("여러 경로", () => {
    expect(parseLibraryPaths("D:\\books|E:\\comics")).toEqual([
      "D:\\books",
      "E:\\comics",
    ]);
  });

  it("빈 조각은 버린다", () => {
    expect(parseLibraryPaths("D:\\books||E:\\comics")).toEqual([
      "D:\\books",
      "E:\\comics",
    ]);
  });
});

describe("joinFilterValues", () => {
  it("빈 목록은 all", () => {
    expect(joinFilterValues([])).toBe("all");
  });

  it("하나면 그 값 그대로", () => {
    expect(joinFilterValues(["unread"])).toBe("unread");
  });

  it("여러 개는 구분자로 잇는다", () => {
    expect(joinFilterValues(["unread", "reading"])).toBe("unread|reading");
  });
});

describe("toggleFilterValue", () => {
  it("아무것도 안 걸린 상태에서 하나 고르기", () => {
    expect(toggleFilterValue("all", "unread")).toBe("unread");
  });

  it("이미 고른 것에 하나 더 추가", () => {
    expect(toggleFilterValue("unread", "reading")).toBe("unread|reading");
  });

  it("고른 것을 다시 누르면 빠진다", () => {
    expect(toggleFilterValue("unread|reading", "unread")).toBe("reading");
  });

  it("마지막 하나를 빼면 all로 돌아간다", () => {
    expect(toggleFilterValue("unread", "unread")).toBe("all");
  });
});

describe("parseFilterChipKey", () => {
  it("값이 없는 그룹은 필드만", () => {
    expect(parseFilterChipKey("searchQuery")).toEqual({
      field: "searchQuery",
    });
  });

  it("다중 선택 그룹은 필드와 값으로 나뉜다", () => {
    expect(parseFilterChipKey("readStatus:unread")).toEqual({
      field: "readStatus",
      value: "unread",
    });
  });

  // 윈도우 경로에는 콜론이 들어간다. 첫 번째 콜론에서만 잘라야
  // `D:\books`가 온전히 남는다
  it("경로의 콜론은 값에 그대로 남는다", () => {
    expect(parseFilterChipKey("libraryPath:D:\\books\\만화")).toEqual({
      field: "libraryPath",
      value: "D:\\books\\만화",
    });
  });
});

describe("normalizeReadStatus", () => {
  it("유효한 값은 그대로 통과한다", () => {
    expect(normalizeReadStatus("all")).toBe("all");
    expect(normalizeReadStatus("unread")).toBe("unread");
    expect(normalizeReadStatus("reading")).toBe("reading");
    expect(normalizeReadStatus("completed")).toBe("completed");
  });

  it("여러 개 고른 값도 그대로 통과한다", () => {
    expect(normalizeReadStatus("unread|reading")).toBe("unread|reading");
  });

  // 구버전의 `read`는 대응하는 구간이 없다. 그대로 두면 체크박스 어디에도
  // 걸리지 않아 드롭다운이 빈 상태로 보인다.
  it("구버전 read와 알 수 없는 값은 all로 떨어진다", () => {
    expect(normalizeReadStatus("read")).toBe("all");
    expect(normalizeReadStatus("")).toBe("all");
    expect(normalizeReadStatus(undefined)).toBe("all");
    expect(normalizeReadStatus(null)).toBe("all");
    expect(normalizeReadStatus(["unread"])).toBe("all");
  });

  it("섞여 들어온 값에서 유효한 것만 남긴다", () => {
    expect(normalizeReadStatus("unread|read")).toBe("unread");
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
