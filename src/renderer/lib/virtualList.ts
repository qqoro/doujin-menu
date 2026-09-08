/**
 * 가상 스크롤 목록의 공통 계산. 다운로더와 라이브러리가 나눠 쓴다.
 *
 * 계산 오류로 깨지는 종류라(뺄셈 순서, 클램프 대상, offset 환산) 컴포넌트 밖에서
 * 테스트할 수 있도록 순수 함수로 둔다.
 */

/**
 * 보이는 인덱스 범위를 덮는 청크 번호 집합.
 *
 * 번호는 전체 결과 기준의 절대 번호다. 그래야 구간을 오가거나 필터를 바꿔도 같은
 * 청크가 캐시에 남는다.
 *
 * @param chunkSize 다운로더 30(히토미 검색 API 페이지 크기), 라이브러리 50
 */
export const chunksForRange = (
  absoluteStart: number,
  absoluteEnd: number,
  chunkSize: number,
): number[] => {
  if (absoluteEnd < absoluteStart) return [];

  const first = Math.floor(Math.max(0, absoluteStart) / chunkSize);
  const last = Math.floor(Math.max(0, absoluteEnd) / chunkSize);

  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
};

/**
 * 그리드 열 수.
 *
 * 패딩은 zoom 바깥의 실제 px이므로 실제 px 공간에서 먼저 빼고 z로 나눈다.
 * 순서를 바꾸면 창 너비 분포의 약 3%에서 열 수가 1 틀어진다.
 */
export const computeCols = (
  scrollerClientWidth: number,
  zoom: number,
  padding: number,
  gap: number,
  minCardWidth: number,
): number => {
  const usableUnit = usableGridWidth(scrollerClientWidth, zoom, padding);
  return Math.max(1, Math.floor((usableUnit + gap) / (minCardWidth + gap)));
};

/** zoom 안쪽 단위 공간으로 환산한 가용 폭. 열 수·행 높이 계산이 공유한다 */
export const usableGridWidth = (
  scrollerClientWidth: number,
  zoom: number,
  padding: number,
): number => {
  const z = zoom > 0 ? zoom : 1;
  return Math.max(0, (scrollerClientWidth - padding * 2) / z);
};

/**
 * 리스트 카드 하나의 최소 폭 (줌 1.0 기준). 이보다 좁아지면 2열로 아낀 세로
 * 공간을 태그 줄바꿈으로 도로 뱉는다.
 */
export const MIN_LIST_CARD_WIDTH = 560;

/** 리스트 카드 사이 간격 (gap-2, pb-2와 맞춘다) */
export const LIST_GAP = 8;

/**
 * 리스트 뷰의 열 수. `computeCols`와 줌 처리가 반대다.
 *
 * 리스트는 CSS `zoom`을 못 쓰고(동적 측정이 1/z만큼 어긋난다 — `cardLayout.ts`
 * 참고) 썸네일 px에 z를 곱하므로, 폭을 나누는 게 아니라 임계값에 곱한다.
 * 행 높이는 태그 개수에 따라 달라져 실측에 맡긴다.
 *
 * @param maxCols 상한. 3열부터는 카드가 태그 줄을 못 담아 세로로만 길어진다
 */
export const computeListCols = (
  scrollerClientWidth: number,
  zoom: number,
  padding: number,
  gap: number,
  minCardWidth: number,
  maxCols = 2,
): number => {
  const z = zoom > 0 ? zoom : 1;
  const usable = Math.max(0, scrollerClientWidth - padding * 2);
  const minW = minCardWidth * z;

  return Math.min(
    maxCols,
    Math.max(1, Math.floor((usable + gap) / (minW + gap))),
  );
};

/**
 * 결과 영역 전체를 덮는 스켈레톤을 띄울지 정한다.
 *
 * "로드된 항목이 0개"를 로딩으로 치면 안 된다. 멀리 점프하면 한순간 0개가 되는데,
 * 그때 스켈레톤으로 갈아끼우면 총 높이를 잡던 스페이서가 언마운트되고 스크롤러
 * 높이가 무너져 scrollTop이 0으로 클램프된다. 첫 렌더 뒤로는 칸마다 개별
 * 스켈레톤이 있으므로 전체 스켈레톤은 첫 렌더 전까지만 쓴다.
 *
 * @param hasRendered 이번 조회에서 목록을 한 번이라도 그렸는지
 */
export const shouldShowSkeleton = ({
  searchStarted,
  isMetaLoading,
  total,
  hasRendered,
}: {
  searchStarted: boolean;
  isMetaLoading: boolean;
  total: number;
  hasRendered: boolean;
}): boolean => searchStarted && (isMetaLoading || (total > 0 && !hasRendered));
