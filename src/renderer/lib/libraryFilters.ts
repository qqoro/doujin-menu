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

export type LibraryFilterState = {
  searchQuery: string;
  libraryPath: string;
  readStatus: "all" | "read" | "unread";
  isFavorite: string;
  offlineStatus: "all" | "online" | "offline";
};

/** 아무것도 걸리지 않은 상태 */
export const LIBRARY_FILTER_DEFAULTS: LibraryFilterState = {
  searchQuery: "",
  libraryPath: "all",
  readStatus: "all",
  isFavorite: "all",
  offlineStatus: "all",
};

/** 화면에 표시할 "적용중인 조건" 하나 */
export type ActiveFilter = {
  /** 이 항목만 해제할 때 되돌릴 필드 */
  key: keyof LibraryFilterState;
  label: string;
};

const READ_STATUS_LABELS: Record<string, string> = {
  read: "읽음",
  unread: "안 읽음",
};

const OFFLINE_STATUS_LABELS: Record<string, string> = {
  online: "온라인만",
  offline: "오프라인만",
};

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

  if (state.libraryPath !== LIBRARY_FILTER_DEFAULTS.libraryPath) {
    result.push({
      key: "libraryPath",
      label: `폴더: ${libraryPathLabel(state.libraryPath)}`,
    });
  }

  if (state.readStatus !== LIBRARY_FILTER_DEFAULTS.readStatus) {
    result.push({
      key: "readStatus",
      label: READ_STATUS_LABELS[state.readStatus] ?? state.readStatus,
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
