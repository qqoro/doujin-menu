/**
 * 가상 스크롤 목록의 공통 계산.
 *
 * 다운로더와 라이브러리가 나눠 씁니다. 전부 순수 함수로 둡니다. 여기 있는
 * 것들은 상호작용 버그가 아니라 계산 오류로 깨지는 종류라(뺄셈 순서, 클램프
 * 대상, offset 환산) 컴포넌트 밖에서 테스트할 수 있어야 합니다.
 *
 * 구간(PAGE) 나누기에 딸린 것들은 다운로더 전용이라 `downloaderVirtual.ts`에
 * 남아 있습니다. 라이브러리는 구간을 나누지 않습니다.
 */

/**
 * 보이는 인덱스 범위를 덮는 청크 번호 집합.
 *
 * 청크 번호는 **전체 결과 기준의 절대 번호**입니다. 그래야 구간을 오가거나
 * 필터를 바꿔도 같은 청크가 캐시에 그대로 남습니다.
 *
 * @param chunkSize 다운로더는 30(히토미 검색 API의 페이지 크기), 라이브러리는 50
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
 * **뺄셈 순서를 지켜야 합니다.** 패딩은 zoom 바깥의 실제 px이므로 실제 px
 * 공간에서 먼저 빼고 나서 z로 나눕니다. `clientWidth / z - padding*2`로 쓰면
 * 폭 600·패딩 8·z 0.7에서 819.7이 나오는데 정답은 812.9입니다. 6.9 단위 차이는
 * 카드+gap 216의 3.2%라, 창 너비 분포의 약 3%에서 열 수가 1 틀어져
 * 재현하기 어려운 버그가 됩니다.
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

/** zoom 안쪽 단위 공간으로 환산한 가용 폭. `computeCols`와 행 높이 계산이 공유합니다 */
export const usableGridWidth = (
  scrollerClientWidth: number,
  zoom: number,
  padding: number,
): number => {
  const z = zoom > 0 ? zoom : 1;
  return Math.max(0, (scrollerClientWidth - padding * 2) / z);
};

/**
 * 리스트 뷰의 열 수.
 *
 * **`computeCols`와 줌 처리가 반대입니다.** 그리드는 컨테이너에 CSS `zoom`이
 * 걸려 있어서 실제 px을 z로 나눠 단위 공간으로 내려보내지만, 리스트는
 * `zoom`을 못 씁니다(동적 측정이 1/z만큼 어긋납니다 — `galleryCard.ts` 참고).
 * 대신 썸네일 px에 z를 직접 곱하므로, 카드가 필요로 하는 최소 폭도 같이
 * 커집니다. 그래서 여기서는 **폭을 나누는 게 아니라 임계값에 곱합니다.**
 *
 * 행 높이는 태그 개수에 따라 달라 실측에 맡기므로 여기서 계산하지 않습니다.
 * 열 수만 나오면 됩니다.
 *
 * @param maxCols 상한. 3열부터는 카드 하나가 태그 줄을 못 담아 세로로만 길어집니다
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
 * 결과 영역 전체를 덮는 스켈레톤을 띄울지 정합니다.
 *
 * **"지금 로드된 항목이 0개"를 로딩으로 치면 안 됩니다.** 활성 청크는 보이는
 * 범위를 따라가므로, 멀리 점프하면 보던 청크가 목록에서 빠지고 목표 청크는
 * 아직 안 와서 한순간 0개가 됩니다. 그때 스켈레톤으로 갈아끼우면 총 높이를
 * 잡고 있던 스페이서가 언마운트되고, 스크롤러 높이가 무너지며 브라우저가
 * scrollTop을 0으로 클램프합니다. 데이터가 도착해 스페이서가 돌아와도
 * 스크롤 위치는 이미 사라진 뒤라 첫 항목으로 튕깁니다.
 *
 * 목록이 한 번 그려진 다음부터는 칸마다 개별 스켈레톤이 있으므로 전체 화면
 * 스켈레톤은 첫 렌더 전까지만 씁니다.
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
