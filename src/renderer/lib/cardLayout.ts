/**
 * 리스트 카드가 공유하는 치수와 메타 조각 타입. 다운로더와 라이브러리가 같은
 * 형태의 카드를 쓰고, 다른 건 표지 비율(3:4 / 2:3)뿐이라 인자로 받는다.
 */
import type { CSSProperties } from "vue";

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

/** 줌 1.0에서의 리스트 썸네일 폭 (최대 줌 1.5에서 255px) */
export const LIST_THUMB_BASE_WIDTH = 170;

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
 *
 * 본문과 패딩도 z를 곱한다. `listCardScaleStyle`이 카드 안쪽 글자·여백을 같이
 * 키우므로, 고정값으로 두면 확대할수록 추정이 모자라 스크롤바가 짧아진다.
 * 간격(`LIST_ROW_GAP`)만은 카드 바깥 래퍼의 `pb-2`라 배율을 안 탄다.
 */
export const listRowEstimate = (
  zoom: number,
  aspect: number = GALLERY_ASPECT,
): number => {
  const z = normalizeZoom(zoom);

  return (
    Math.max(listThumbnailSize(zoom, aspect).height, LIST_BODY_MIN_HEIGHT * z) +
    LIST_ROW_PADDING * z +
    LIST_ROW_GAP
  );
};

/**
 * 리스트 카드 루트에 얹는 배율 스타일.
 *
 * 리스트는 CSS `zoom`을 못 쓰는데(위 주석 참고) 썸네일 px에만 줌을 걸면 글자와
 * 여백은 그대로라, 확대할수록 표지만 커지고 본문 옆이 텅 빈다. 같은 150%인데
 * 그리드는 제목이 19.5px, 리스트는 15px로 갈리기도 했다.
 *
 * Tailwind v4 유틸이 `calc(var(--spacing) * n)`과 `var(--text-xs)` 형태로
 * 컴파일되는 걸 이용해 그 변수들을 카드 스코프에서 z배로 재정의한다. 실제 px이
 * 바뀌는 것이라 `zoom`과 달리 측정 API와 어긋나지 않는다.
 *
 * 이 변수를 안 타는 것들은 카드 쪽에서 직접 맞춰야 한다.
 * - `text-[15px]` 같은 임의값 → em으로 쓴다 (루트 `font-size`가 기준이 된다)
 * - shadcn `Button size="sm"`의 `text-[0.8rem]` → 셸 루트의 후손 변형이 덮는다
 */
export const listCardScaleStyle = (zoom: number): CSSProperties => {
  const z = normalizeZoom(zoom);

  return {
    "--spacing": `calc(0.25rem * ${z})`,
    "--text-xs": `calc(0.75rem * ${z})`,
    "--text-sm": `calc(0.875rem * ${z})`,
    "--text-base": `calc(1rem * ${z})`,
    fontSize: `calc(1rem * ${z})`,
  };
};
