import type { ReadStatus } from "../../types/ipc";

/**
 * 라이브러리 화면의 "지금 무엇이 걸려 있는지"를 계산합니다.
 *
 * 검색·필터 상태를 앱 재시작 후에도 유지하면서 생기는 부작용이 하나 있습니다.
 * 어제 걸어둔 조건을 기억하는 사람은 거의 없어서, 책 몇 권만 보이는 화면을
 * 보고 "책이 사라졌다"고 오해하기 쉽습니다. 그래서 걸려 있는 조건을 항상
 * 눈에 보이게 만들고, 한 번에 지울 수 있게 합니다.
 *
 * 정렬 기준과 뷰 모드는 여기 포함하지 않습니다. 책을 숨기지 않기 때문에
 * 오해의 원인이 되지 않습니다.
 */

export type { ReadStatus };

/**
 * 여러 값을 고를 수 있는 필터(읽음 상태·라이브러리 폴더)를 URL 쿼리와 설정에
 * 담을 때 쓰는 구분자.
 *
 * 이 두 필터는 화면 상태로는 목록이지만 저장될 때는 문자열 하나입니다.
 * URL 쿼리 동기화(`useQueryAndParams`)와 `libraryViewSettings`가 문자열만
 * 다루기 때문이고, 덕분에 값 하나만 저장돼 있던 구버전 설정이 원소 하나짜리
 * 목록으로 그대로 읽힙니다. 구분자로 `|`를 쓰는 이유는 윈도우 경로에 들어갈
 * 수 없는 문자라 폴더 이름과 부딪히지 않기 때문입니다.
 */
const VALUE_SEPARATOR = "|";

/** 아무것도 고르지 않은 상태 */
const NONE = "all";

/**
 * 읽음 상태는 `current_page`를 기준으로 세 구간으로 나뉩니다.
 * 한 권은 반드시 한 구간에만 속하며, 통계 화면의 분류와 같은 기준입니다.
 */
export const READ_STATUS_OPTIONS: readonly {
  value: ReadStatus;
  label: string;
}[] = [
  { value: "unread", label: "안 읽음" },
  { value: "reading", label: "읽는 중" },
  { value: "completed", label: "완독" },
];

export type LibraryFilterState = {
  searchQuery: string;
  /** 고른 폴더들을 `|`로 이은 값. `all`이면 전체 */
  libraryPath: string;
  /** 고른 읽음 상태들을 `|`로 이은 값. `all`이면 전체 */
  readStatus: string;
  isFavorite: string;
  offlineStatus: "all" | "online" | "offline";
};

/** 아무것도 걸리지 않은 상태 */
export const LIBRARY_FILTER_DEFAULTS: LibraryFilterState = {
  searchQuery: "",
  libraryPath: NONE,
  readStatus: NONE,
  isFavorite: NONE,
  offlineStatus: NONE,
};

/** 화면에 표시할 "적용중인 조건" 하나 */
export type ActiveFilter = {
  /**
   * 이 항목만 해제할 때 쓰는 키. 여러 값을 고를 수 있는 필터는 `필드:값`
   * 형태라 값 하나만 골라 뺄 수 있습니다.
   */
  key: string;
  label: string;
};

const READ_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  READ_STATUS_OPTIONS.map(({ value, label }) => [value, label]),
);

const OFFLINE_STATUS_LABELS: Record<string, string> = {
  online: "온라인만",
  offline: "오프라인만",
};

/** 저장된 문자열을 고른 값 목록으로 되돌립니다. 중복과 빈 조각은 버립니다 */
function parseFilterValues(value: unknown): string[] {
  if (typeof value !== "string") return [];

  const picked = new Set<string>();
  for (const part of value.split(VALUE_SEPARATOR)) {
    if (part !== "" && part !== NONE) picked.add(part);
  }
  return [...picked];
}

/** 고른 라이브러리 폴더 목록. 빈 배열이면 전체 */
export function parseLibraryPaths(value: unknown): string[] {
  return parseFilterValues(value);
}

/**
 * 고른 읽음 상태 목록. 빈 배열이면 전체.
 *
 * 구버전 설정의 `read`(한 번이라도 연 책)처럼 대응하는 구간이 없는 값은
 * 버립니다. 이 정규화가 없으면 체크박스 어디에도 걸리지 않는 값이 그대로
 * 남아 드롭다운이 아무것도 선택되지 않은 상태로 보입니다.
 */
export function parseReadStatuses(value: unknown): ReadStatus[] {
  const valid = new Set<string>(READ_STATUS_OPTIONS.map((o) => o.value));
  return parseFilterValues(value).filter((v): v is ReadStatus => valid.has(v));
}

/** 고른 값 목록을 저장용 문자열로 되돌립니다 */
export function joinFilterValues(values: readonly string[]): string {
  return values.length === 0 ? NONE : values.join(VALUE_SEPARATOR);
}

/** 값 하나를 고르거나 다시 눌러 뺍니다 */
export function toggleFilterValue(current: string, value: string): string {
  const values = parseFilterValues(current);
  return joinFilterValues(
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value],
  );
}

/**
 * 칩의 키를 필드와 값으로 나눕니다.
 *
 * 윈도우 경로에는 콜론이 들어가므로 첫 번째 콜론에서만 자릅니다.
 * 그러지 않으면 `D:\books`가 잘려 해제가 먹히지 않습니다.
 */
export function parseFilterChipKey(key: string): {
  field: keyof LibraryFilterState;
  value?: string;
} {
  const index = key.indexOf(":");
  if (index === -1) return { field: key as keyof LibraryFilterState };

  return {
    field: key.slice(0, index) as keyof LibraryFilterState,
    value: key.slice(index + 1),
  };
}

/** 저장된 설정이나 URL 쿼리에서 읽어온 값을 유효한 읽음 상태 값으로 되돌립니다 */
export function normalizeReadStatus(value: unknown): string {
  return joinFilterValues(parseReadStatuses(value));
}

/**
 * 라이브러리 폴더 경로에서 표시용 이름만 뽑습니다.
 *
 * 전체 경로를 그대로 쓰면 칩 하나가 화면을 다 차지합니다. 윈도우와 POSIX
 * 구분자가 섞여 들어올 수 있어 둘 다 자릅니다.
 */
export function libraryPathLabel(fullPath: string): string {
  const segments = fullPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? fullPath;
}

/** 기본값과 다른 항목만 추려서 표시 순서대로 돌려줍니다 */
export function activeFilters(state: LibraryFilterState): ActiveFilter[] {
  const result: ActiveFilter[] = [];

  // 검색어는 앞뒤 공백만 있는 경우 걸린 것으로 보지 않습니다
  const trimmed = state.searchQuery.trim();
  if (trimmed !== "") {
    result.push({ key: "searchQuery", label: `검색: ${trimmed}` });
  }

  for (const path of parseLibraryPaths(state.libraryPath)) {
    result.push({
      key: `libraryPath:${path}`,
      label: `폴더: ${libraryPathLabel(path)}`,
    });
  }

  for (const status of parseReadStatuses(state.readStatus)) {
    result.push({
      key: `readStatus:${status}`,
      label: READ_STATUS_LABELS[status] ?? status,
    });
  }

  if (state.isFavorite !== LIBRARY_FILTER_DEFAULTS.isFavorite) {
    result.push({ key: "isFavorite", label: "즐겨찾기만" });
  }

  if (state.offlineStatus !== LIBRARY_FILTER_DEFAULTS.offlineStatus) {
    result.push({
      key: "offlineStatus",
      label: OFFLINE_STATUS_LABELS[state.offlineStatus] ?? state.offlineStatus,
    });
  }

  return result;
}

/** 하나라도 걸려 있으면 true */
export function hasActiveFilters(state: LibraryFilterState): boolean {
  return activeFilters(state).length > 0;
}
