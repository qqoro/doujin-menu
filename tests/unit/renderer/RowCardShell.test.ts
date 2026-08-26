// @vitest-environment jsdom
/**
 * RowCardShell은 라이브러리·읽음 기록·시리즈·중복 정리가 함께 씁니다.
 * 표지 클릭을 따로 받는 `zoomable`이 켜지지 않은 화면에서 기존 동작(표지 클릭도
 * 카드 클릭)이 그대로인지가 이 테스트의 핵심입니다.
 */
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick } from "vue";
import RowCardShell from "../../../src/renderer/components/feature/parts/RowCardShell.vue";

interface Events {
  click: number;
  thumbnailClick: number;
}

const mountShell = (props: Record<string, unknown>) => {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);

  const events: Events = { click: 0, thumbnailClick: 0 };

  const app = createApp({
    render: () =>
      h(RowCardShell, {
        coverUrl: "file:///cover.webp",
        alt: "표지",
        ...props,
        onClick: () => events.click++,
        onThumbnailClick: () => events.thumbnailClick++,
      }),
  });
  app.mount(host);

  const root = host.firstElementChild as HTMLElement;
  return { app, host, root, events };
};

/** 표지 래퍼는 셸 루트의 첫 자식이다 */
const thumbnailOf = (root: HTMLElement) =>
  root.firstElementChild as HTMLElement;

describe("RowCardShell", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("zoomable을 안 켜면 표지 클릭이 카드 클릭으로 올라간다 (기존 화면 동작)", async () => {
    const { root, events } = mountShell({});

    thumbnailOf(root).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(events.click).toBe(1);
    expect(events.thumbnailClick).toBe(0);
  });

  it("zoomable을 켜면 표지 클릭이 카드 클릭을 대신한다", async () => {
    const { root, events } = mountShell({ zoomable: true });

    thumbnailOf(root).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    // 전파가 막히지 않으면 미리보기를 열면서 선택까지 같이 토글된다
    expect(events.thumbnailClick).toBe(1);
    expect(events.click).toBe(0);
  });

  it("zoomable이어도 표지 밖 클릭은 카드 클릭이다", async () => {
    const { root, events } = mountShell({ zoomable: true });

    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(events.click).toBe(1);
    expect(events.thumbnailClick).toBe(0);
  });

  it("zoomable일 때만 확대 커서를 준다", () => {
    const plain = mountShell({});
    expect(thumbnailOf(plain.root).className).not.toContain("cursor-zoom-in");

    const zoomable = mountShell({ zoomable: true });
    expect(thumbnailOf(zoomable.root).className).toContain("cursor-zoom-in");
  });
});
