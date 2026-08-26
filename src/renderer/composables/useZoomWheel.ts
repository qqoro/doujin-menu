/**
 * Ctrl+휠 썸네일 줌. 표지 목록을 띄우는 화면들이 공유한다.
 * Ctrl이 없으면 손대지 않고 넘긴다 — 평범한 휠은 스크롤이어야 한다.
 */
import { useUiStore } from "@/store/uiStore";

export function useZoomWheel() {
  const uiStore = useUiStore();

  const handleZoomWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    if (event.deltaY < 0) {
      uiStore.zoomIn();
    } else {
      uiStore.zoomOut();
    }
  };

  return { handleZoomWheel };
}
