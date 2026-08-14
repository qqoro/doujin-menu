/**
 * 다운로더 가상 스크롤의 좌표·페이지 계산.
 *
 * 전부 순수 함수로 둡니다. 여기 있는 것들은 상호작용 버그가 아니라 계산 오류로
 * 깨지는 종류라(뺄셈 순서, 클램프 대상, offset 환산) 컴포넌트 밖에서 테스트할 수
 * 있어야 합니다. 컴포넌트에는 DOM 측정과 렌더링만 남깁니다.
 *
 * 라이브러리와 나눠 쓰는 것들(`chunksForRange`·`computeCols`·`computeListCols`·
 * `shouldShowSkeleton`)은 `virtualList.ts`로 옮겼습니다. 여기 남은 것은 전부
 * 구간(PAGE) 나누기에 딸린 다운로더 전용입니다.
 */
import { computeCols, usableGridWidth } from "./virtualList";

/**
 * 한 번에 스크롤할 수 있는 최대 건수.
 *
 * **이 값을 정하는 건 기술 한계가 아니라 실사용입니다.** 한 화면에서 수천 건을
 * 넘겨 보는 일이 없어서, 스크롤로 닿는 범위를 그 정도로 끊고 그 밖은 "N번째
 * 이동"으로 건너뜁니다. 두 상한에는 넉넉히 못 미칩니다.
 *
 * 1. **브라우저 좌표 상한** — 레이아웃 좌표는 33,554,428px에서 클램프됩니다
 *    (Electron 38 / Chromium 140에서 실측). 리스트는 1열이라 여기에 가장
 *    빨리 닿는데, 최대 줌(행 288px)에서도 1.44M px이라 23배 여유입니다.
 * 2. **`measurements` 배열 메모리** — `virtual-core`의 `getMeasurements`는
 *    보이는 개수가 아니라 `count`만큼 객체를 만들어 배열에 담습니다.
 *    항목당 약 120바이트라 0.6MB이고, 리사이즈·줌으로 `estimateSize`가
 *    바뀔 때마다 통째로 재생성되므로 작을수록 좋습니다.
 *
 * 대신 구간 UI가 평소에도 드러납니다. 한국어 검색(약 98,640)이 20구간입니다.
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
 * 현재 페이지에서 실제로 보여줄 개수.
 *
 * **`min(total, PAGE)`로 쓰면 안 됩니다.** 그러면 페이지를 바꿔도 매번 앞
 * PAGE건만 보게 되어 창 밖으로 나갈 수 없습니다. 마지막 페이지는 짧습니다.
 */
export const getShownCount = (total: number, page: number): number =>
  Math.max(0, Math.min(total - getOffset(page), PAGE));

/**
 * 1-based 위치 N을 페이지와 페이지 안 인덱스로 나눕니다.
 *
 * "N번째로 이동"이 쓰는 값입니다. 목표 페이지가 현재와 같으면 순수
 * `scrollToIndex(localIndex)`이고, 다르면 페이지를 바꾼 뒤 같은 호출을 합니다.
 */
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
 * 그리드 열 수와 행 높이를 계산합니다.
 *
 * 열 수 계산은 `virtualList.computeCols`와 같아서 그쪽을 씁니다. 여기 남은 건
 * **행 높이**인데, 이건 다운로더 카드에서만 성립합니다. `GalleryThumbnailCard`는
 * `aspect-3/4`이고 정보·버튼 영역이 전부 absolute라 높이가 폭에서 확정됩니다.
 * 루트에 border 1px(border-box)가 있어 `(cardW - 2) * 4/3 + 2`입니다.
 *
 * 라이브러리 `BookCard`는 하단 정보 영역이 제목·작가·태그에 따라 늘어나서
 * 이 계산이 성립하지 않습니다. 그쪽은 행마다 실측합니다.
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
 * 뷰포트에 실제로 보이는 범위를 전체 결과 기준 1-based 위치로 환산합니다.
 *
 * **`virtualizer.range`를 넘겨야 합니다. `getVirtualItems()`가 아닙니다.**
 * overscan은 `defaultRangeExtractor`에서 붙으므로 `getVirtualItems()`에는
 * 화면 밖 항목이 섞입니다.
 *
 * `offset`을 더하는 걸 빠뜨리면 2페이지에서도 표시가 1부터 시작해 값이
 * 거짓이 됩니다. 사용자는 이 숫자를 보고 다음 점프 값을 정합니다.
 *
 * @param cols 현재 뷰의 열 수 (그리드·리스트 모두 1보다 클 수 있습니다)
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
