export type TapAction = "ignore" | "stop-autoplay" | "toggle-controls" | "zone";

// Viewer.vue의 좌우 넘김 영역(w-1/4 max-w-[500px])과 같은 크기
const ZONE_RATIO = 0.25;
const ZONE_MAX_PX = 500;

/** 뷰어 화면을 터치로 탭했을 때 무엇을 할지 정한다 */
export function classifyTap(input: {
  pointerType: string;
  insideControls: boolean;
  isAutoPlay: boolean;
  clientX: number;
  width: number;
  hasSideZones: boolean;
}): TapAction {
  if (input.pointerType !== "touch") return "ignore";
  if (input.insideControls) return "ignore";
  // 자동 넘김 중에는 어디를 탭하든 멈추기만 한다. 넘김 영역이어도 페이지를 넘기지 않는다
  if (input.isAutoPlay) return "stop-autoplay";
  if (!input.hasSideZones) return "toggle-controls";

  const zone = Math.min(input.width * ZONE_RATIO, ZONE_MAX_PX);
  if (input.clientX < zone || input.clientX > input.width - zone) return "zone";
  return "toggle-controls";
}
