// 뷰어·라이브러리에서 순환 가능한 정렬 기준 목록 (random 제외 — 비결정적 동작 방지)
export const SORT_CYCLE: string[] = [
  "added_at",
  "file_mtime",
  "title",
  "artists",
  "last_read_at",
  "page_count",
  "hitomi_id",
];

// 정렬 기준 → 한국어 라벨 (토스트/도움말 표시용)
export const SORT_LABELS: Record<string, string> = {
  added_at: "추가된 날짜",
  file_mtime: "파일 수정 날짜",
  title: "제목",
  artists: "작가",
  last_read_at: "최근 읽음",
  page_count: "페이지 수",
  hitomi_id: "Hitomi ID",
};

/**
 * 현재 정렬 기준의 다음 값을 반환. 현재 값이 목록에 없거나
 * undefined면 첫 번째 기준으로 돌아간다.
 */
export function nextSortBy(
  current: string | undefined,
  cycle: string[],
): string {
  if (!current) return cycle[0];
  const idx = cycle.indexOf(current);
  if (idx === -1) return cycle[0];
  return cycle[(idx + 1) % cycle.length];
}

/**
 * 정렬 순서(asc/desc)를 반전한다. 현재 값이 없으면 desc를 기본으로 한다.
 */
export function toggledSortOrder(
  current: "asc" | "desc" | undefined,
): "asc" | "desc" {
  if (current === "asc") return "desc";
  if (current === "desc") return "asc";
  return "desc";
}
