import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import {
  BANNER_DELAY_MS,
  useConnectionBanner,
  webConnected,
} from "@/composables/useWebConnection";

describe("useConnectionBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    webConnected.value = true;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("3초 넘게 끊겨 있을 때만 보이고, 다시 붙으면 바로 사라진다", async () => {
    const scope = effectScope();
    const visible = scope.run(() => useConnectionBanner())!;
    expect(BANNER_DELAY_MS).toBe(3000);

    webConnected.value = false;
    await nextTick();
    vi.advanceTimersByTime(2999);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(true);

    webConnected.value = true;
    await nextTick();
    expect(visible.value).toBe(false);
    scope.stop();
  });

  it("3초 안에 다시 붙으면 띄우지 않는다", async () => {
    const scope = effectScope();
    const visible = scope.run(() => useConnectionBanner())!;
    webConnected.value = false;
    await nextTick();
    vi.advanceTimersByTime(1000);
    webConnected.value = true;
    await nextTick();
    vi.advanceTimersByTime(5000);
    expect(visible.value).toBe(false);
    scope.stop();
  });
});
