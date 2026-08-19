/**
 * 리스트 카드가 공유하는 치수와 메타 조각 타입. 다운로더와 라이브러리가 같은
 * 형태의 카드를 쓰고, 다른 건 표지 비율(3:4 / 2:3)뿐이라 인자로 받는다.
 */

export type MetaField = "pages" | "type" | "language" | "date" | "id";

export interface MetaPart {
  key: MetaField;
  text: string;
}

/** 크레딧 줄의 종류. 검색어 접두사와 같은 문자열입니다 */
export type CreditPrefix = "artist" | "group" | "series" | "character";

export interface CreditSource {
  artists?: string[];
  groups?: string[];
  series?: string[];
  characters?: string[];
}

// 리스트 카드 치수.
//
// 리스트에 CSS `zoom`을 쓰면 안 된다. 행 높이를 `measureElement`로 동적 측정하는데
// `zoom` 아래에서는 `borderBoxSize`와 `getBoundingClientRect`가 1/z만큼 어긋난다.
// 대신 줌 값을 받아 px에 직접 곱한다 (그리드는 `estimateSize`로 계산해 측정 API를
// 안 타므로 `zoom`을 쓸 수 있다).

/** 줌 1.0에서의 리스트 썸네일 폭 */
export const LIST_THUMB_BASE_WIDTH = 128;

/** 히토미 썸네일 비율(3:4)의 세로/가로 */
export const GALLERY_ASPECT = 4 / 3;

/** 라이브러리 표지 비율(2:3)의 세로/가로 */
export const BOOK_ASPECT = 3 / 2;

/** 카드 상하 패딩 (p-3 = 12px씩) */
const LIST_ROW_PADDING = 24;

/** 가상 스크롤 항목 사이 간격 (pb-2) */
const LIST_ROW_GAP = 8;

/**
 * 썸네일을 최소로 줄여도 본문이 차지하는 높이.
 * 제목 20 + 메타 18 + 크레딧 18 + 태그 2줄 48 + 줄 간격 16 = 120.
 * 태그 줄 수는 렌더 전에 알 수 없어 2줄로 가정한다 (실측이 곧 덮어쓴다).
 */
const LIST_BODY_MIN_HEIGHT = 120;

const normalizeZoom = (zoom: number): number =>
  Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

/** 리스트 썸네일의 실제 px 치수 */
export const listThumbnailSize = (
  zoom: number,
  aspect: number = GALLERY_ASPECT,
): { width: number; height: number } => {
  const width = Math.round(LIST_THUMB_BASE_WIDTH * normalizeZoom(zoom));
  return { width, height: Math.round(width * aspect) };
};

/**
 * 리스트 행의 초기 추정 높이. 실측 전에 스크롤바 길이를 잡는 값이다.
 * 줌을 안 따라가면 최소 줌에서 실제보다 세 배 넘게 잡힌다.
 */
export const listRowEstimate = (
  zoom: number,
  aspect: number = GALLERY_ASPECT,
): number =>
  Math.max(listThumbnailSize(zoom, aspect).height, LIST_BODY_MIN_HEIGHT) +
  LIST_ROW_PADDING +
  LIST_ROW_GAP;
