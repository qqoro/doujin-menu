// @vitest-environment jsdom
/**
 * 컨텍스트마다 window 리스너를 따로 걸고, 매칭된 액션이 있으면
 * stopImmediatePropagation으로 뒤쪽 리스너를 끊는다. 그래서 라이브러리가
 * 어떤 키를 잡는 순간 레이아웃의 같은 키는 영영 오지 않는다.
 *
 * 핸들러가 `false`를 반환하면 "안 잡았다"로 보고 그대로 흘려보내는 게
 * 이 테스트의 핵심이다. Escape 하나를 상황에 따라 나눠 쓰기 위한 장치다.
 */
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { useKeybindings } from "../../../../src/renderer/composables/useKeybindings";

/** 언마운트해야 window 리스너가 떨어진다. 남으면 다음 테스트의 키를 가로챈다 */
const mounted: { unmount: () => void }[] = [];

const mountWith = (setups: (() => void)[]) => {
  const host = document.createElement("div");
  document.body.appendChild(host);

  // 자식이 먼저 mounted 되므로 setups[0]의 리스너가 먼저 등록된다
  const build = (index: number): ReturnType<typeof defineComponent> =>
    defineComponent({
      setup() {
        setups[index]();
        const child = index > 0 ? build(index - 1) : null;
        return () => (child ? h(child) : null);
      },
    });

  const app = createApp(build(setups.length - 1));
  app.mount(host);
  mounted.push(app);
};

/** 실제 키 입력처럼 요소에서 올려보낸다. window에 직접 쏘면 target이 window라 다르다 */
const press = (key: string) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(event);
  return event;
};

describe("useKeybindings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  afterEach(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });

  it("매칭된 액션의 핸들러를 부르고 기본 동작을 막는다", () => {
    const handler = vi.fn();
    mountWith([
      () => useKeybindings("library", { "library:cycle-sort": handler }),
    ]);

    const event = press("d");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("핸들러가 false를 반환하면 기본 동작을 막지 않는다", () => {
    const handler = vi.fn(() => false);
    mountWith([
      () => useKeybindings("library", { "library:cycle-sort": handler }),
    ]);

    const event = press("d");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("false를 반환하면 같은 키를 다른 컨텍스트가 이어받는다", () => {
    // Escape는 라이브러리(포커스 해제)와 레이아웃(창 최소화)이 같이 쓴다.
    // 해제할 포커스가 없을 때 창 최소화까지 도달해야 한다
    const layoutHandler = vi.fn();

    mountWith([
      () => useKeybindings("library", { "library:clear-focus": () => false }),
      () => useKeybindings("layout", { "layout:minimize": layoutHandler }),
    ]);

    press("Escape");

    expect(layoutHandler).toHaveBeenCalledTimes(1);
  });

  it("false를 반환하지 않으면 뒤쪽 컨텍스트로 넘어가지 않는다", () => {
    const libraryHandler = vi.fn();
    const layoutHandler = vi.fn();

    mountWith([
      () =>
        useKeybindings("library", { "library:clear-focus": libraryHandler }),
      () => useKeybindings("layout", { "layout:minimize": layoutHandler }),
    ]);

    press("Escape");

    expect(libraryHandler).toHaveBeenCalledTimes(1);
    expect(layoutHandler).not.toHaveBeenCalled();
  });

  it("입력 요소에 포커스가 있으면 아무것도 하지 않는다", () => {
    const handler = vi.fn();
    mountWith([
      () => useKeybindings("library", { "library:cycle-sort": handler }),
    ]);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", bubbles: true }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("enabled가 false면 키를 아예 보지 않는다", () => {
    // 라이브러리는 keep-alive로 살아 있어 다른 페이지에서도 리스너가 남는다.
    // 페이지가 비활성일 때 방향키를 삼키면 설정·통계 화면의 스크롤이 막힌다
    const handler = vi.fn();
    let active = false;
    mountWith([
      () =>
        useKeybindings(
          "library",
          { "library:cycle-sort": handler },
          { enabled: () => active },
        ),
    ]);

    const blocked = press("d");
    expect(handler).not.toHaveBeenCalled();
    expect(blocked.defaultPrevented).toBe(false);

    active = true;
    press("d");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
