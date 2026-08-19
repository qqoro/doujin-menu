/**
 * 다운로더 가상 스크롤의 좌표·페이지 계산. 구간(PAGE) 나누기에 딸린 전용 함수들이다.
 * 라이브러리와 나눠 쓰는 계산은 `virtualList.ts`에 있다.
 */
import { computeCols, usableGridWidth } from "./virtualList";

/**
 * 한 번에 스크롤할 수 있는 최대 건수.
 *
 * 기술 한계가 아니라 실사용 기준이다. 한 화면에서 수천 건을 넘겨 보는 일이 없어
 * 스크롤 범위를 여기서 끊고 그 밖은 "N번째 이동"으로 건너뛴다. 브라우저 좌표
 * 상한(33,554,428px)과 `measurements` 배열 메모리(항목당 약 120바이트, 줌·리사이즈
 * 때마다 재생성) 양쪽에 넉넉히 못 미친다.
 */
export const PAGE = 5_000;

/** 상세 조회를 묶는 단위. 기존 검색 API의 페이지 크기와 같습니다 */
export const CHUNK_SIZE = 30;

/** 결과 전체가 몇 페이지인지. 결과가 없어도 1을 반환합니다 */
export const getPageCount = (total: number): number =>
  Math.max(1, Math.ceil(Math.max(0, total) / PAGE));

/** 페이지 번호를 유효 범위로 자릅니다 */
export const clampPage = (page: number, total: number): number =>
  Math.min(Math.max(0, Math.floor(page)), getPageCount(total) - 1);

/** 현재 페이지가 전체 결과에서 시작하는 절대 인덱스 (0-based) */
export const getOffset = (page: number): number => page * PAGE;

/**
 * 현재 페이지에서 실제로 보여줄 개수. 마지막 페이지는 짧다.
 * `min(total, PAGE)`로 쓰면 페이지를 바꿔도 매번 앞 PAGE건만 보게 된다.
 */
export const getShownCount = (total: number, page: number): number =>
  Math.max(0, Math.min(total - getOffset(page), PAGE));

/** 1-based 위치 N을 페이지와 페이지 안 인덱스로 나눈다. "N번째로 이동"이 쓴다 */
export const locateNth = (
  n: number,
  total: number,
): { page: number; localIndex: number } | null => {
  if (!Number.isFinite(n)) return null;

  const index = Math.floor(n) - 1;
  if (index < 0 || index >= total) return null;

  return { page: Math.floor(index / PAGE), localIndex: index % PAGE };
};

export interface GridMetrics {
  cols: number;
  /** zoom 컨테이너 안쪽 기준 행 높이 */
  rowHUnit: number;
  /** 스크롤러 기준 실제 행 높이. virtualizer에 넘기는 값 */
  rowHActual: number;
}

/**
 * 그리드 열 수와 행 높이.
 *
 * 행 높이 식은 다운로더 카드에서만 성립한다. `GalleryThumbnailCard`는 `aspect-3/4`에
 * 정보·버튼이 전부 absolute라 높이가 폭에서 확정되고, 루트 border 1px(border-box)
 * 때문에 `(cardW - 2) * 4/3 + 2`가 된다. 라이브러리 카드는 하단 정보가 늘어나므로
 * 행마다 실측한다.
 */
export const computeGridMetrics = (
  scrollerClientWidth: number,
  zoom: number,
  padding: number,
  gap: number,
  minCardWidth: number,
): GridMetrics => {
  const z = zoom > 0 ? zoom : 1;
  const usableUnit = usableGridWidth(scrollerClientWidth, zoom, padding);

  const cols = computeCols(
    scrollerClientWidth,
    zoom,
    padding,
    gap,
    minCardWidth,
  );
  const cardWUnit = Math.max(1, (usableUnit - gap * (cols - 1)) / cols);
  const rowHUnit = (cardWUnit - 2) * (4 / 3) + 2 + gap;

  return { cols, rowHUnit, rowHActual: rowHUnit * z };
};

/**
 * 뷰포트에 보이는 범위를 전체 결과 기준 1-based 위치로 환산한다.
 *
 * `getVirtualItems()`가 아니라 `virtualizer.range`를 넘겨야 한다. overscan이
 * 붙은 쪽에는 화면 밖 항목이 섞인다.
 *
 * @param cols 현재 뷰의 열 수 (그리드·리스트 모두 1보다 클 수 있다)
 */
export const visibleRange = (
  range: { startIndex: number; endIndex: number } | null,
  page: number,
  cols: number,
  shownCount: number,
): { first: number; last: number } | null => {
  if (!range || shownCount <= 0) return null;

  const offset = getOffset(page);
  const lanes = Math.max(1, cols);

  const firstLocal = Math.max(0, range.startIndex) * lanes;
  if (firstLocal >= shownCount) return null;

  const lastLocal = Math.min((range.endIndex + 1) * lanes, shownCount);

  return { first: offset + firstLocal + 1, last: offset + lastLocal };
};
