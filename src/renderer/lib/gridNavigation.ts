export type FocusDirection = "left" | "right" | "up" | "down";

/**
 * 방향키로 옮겨 갈 카드의 인덱스를 계산한다.
 *
 * 그리드와 리스트가 같은 함수를 쓴다. 리스트도 내부적으로는 1~2열 그리드라
 * 열 수만 바꿔 넘기면 되고, 1열이면 상하와 좌우가 자연히 같은 동작이 된다.
 *
 * 인덱스는 뷰 모드와 무관한 전체 목록 기준 절대 순번이다. 그리드↔리스트를
 * 오가도 같은 책을 계속 가리킨다.
 */
export function nextFocusIndex(
  current: number,
  direction: FocusDirection,
  cols: number,
  total: number,
): number {
  if (total <= 0) return -1;

  // 스크롤러 폭을 아직 재지 못한 첫 프레임에는 열 수가 0으로 들어온다
  const lanes = Math.max(1, cols);

  // 포커스가 없던 상태(-1)와 목록이 줄어 범위를 벗어난 상태를 함께 정리한다
  if (current < 0) return 0;
  const from = Math.min(current, total - 1);

  switch (direction) {
    case "left":
      return Math.max(0, from - 1);
    case "right":
      return Math.min(total - 1, from + 1);
    case "up": {
      const target = from - lanes;
      return target >= 0 ? target : from;
    }
    case "down": {
      const target = from + lanes;
      if (target < total) return target;
      // 마지막 행이 덜 찼으면 그 행의 마지막 항목으로 붙는다. 제자리에 두면
      // 아래 줄이 눈에 보이는데도 내려가지 않는다
      const lastRow = Math.floor((total - 1) / lanes);
      return Math.floor(from / lanes) < lastRow ? total - 1 : from;
    }
  }
}
