// @vitest-environment jsdom
/**
 * Ctrl 없는 휠까지 가로채면 목록이 아예 스크롤되지 않으므로 그 경계가 핵심이다.
 */
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useZoomWheel } from "../../../src/renderer/composables/useZoomWheel";
import { useUiStore } from "../../../src/renderer/store/uiStore";

const wheel = (init: WheelEventInit) =>
  new WheelEvent("wheel", { cancelable: true, ...init });

describe("useZoomWheel", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("Ctrl 없는 휠은 무시하고 스크롤에 넘긴다", () => {
    const uiStore = useUiStore();
    const { handleZoomWheel } = useZoomWheel();
    const before = uiStore.thumbnailZoom;

    const event = wheel({ deltaY: -100 });
    handleZoomWheel(event);

    expect(uiStore.thumbnailZoom).toBe(before);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Ctrl+위로 굴리면 확대하고 기본 동작을 막는다", () => {
    const uiStore = useUiStore();
    const { handleZoomWheel } = useZoomWheel();
    uiStore.setThumbnailZoom(1.0);

    const event = wheel({ ctrlKey: true, deltaY: -100 });
    handleZoomWheel(event);

    expect(uiStore.thumbnailZoom).toBe(1.1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+아래로 굴리면 축소한다", () => {
    const uiStore = useUiStore();
    const { handleZoomWheel } = useZoomWheel();
    uiStore.setThumbnailZoom(1.0);

    handleZoomWheel(wheel({ ctrlKey: true, deltaY: 100 }));

    expect(uiStore.thumbnailZoom).toBe(0.9);
  });

  it("최대·최소 배율에서는 더 이상 변하지 않는다", () => {
    const uiStore = useUiStore();
    const { handleZoomWheel } = useZoomWheel();

    uiStore.setThumbnailZoom(999);
    const max = uiStore.thumbnailZoom;
    handleZoomWheel(wheel({ ctrlKey: true, deltaY: -100 }));
    expect(uiStore.thumbnailZoom).toBe(max);

    uiStore.setThumbnailZoom(0);
    const min = uiStore.thumbnailZoom;
    handleZoomWheel(wheel({ ctrlKey: true, deltaY: 100 }));
    expect(uiStore.thumbnailZoom).toBe(min);
  });
});
