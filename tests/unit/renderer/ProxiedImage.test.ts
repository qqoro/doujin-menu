// @vitest-environment jsdom
/**
 * ProxiedImage 컴포넌트의 "슬롯 재사용" 동작을 검증합니다.
 *
 * 다운로더 가상 스크롤은 카드의 :key를 위치 기반(`row.index-col`)으로 쓰기 때문에
 * 창 리사이즈로 열 수가 바뀌면 같은 슬롯에 다른 갤러리가 들어와 컴포넌트 인스턴스가
 * 재사용됩니다. 이때 props.id/url이 바뀌면 옛 이미지를 버리고 새 이미지를
 * 그려야 합니다. 네트워크/IPC 없이 캐시 모듈만 모킹해 이 동작을 검증합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick, reactive } from "vue";

// vi.mock은 호이스트되므로 import보다 먼저 적용됩니다. 실제 캐시 모듈(@/api 등을
// 끌어들이는)을 평가하지 않도록 팩토리로 가짜 함수만 내보냅니다.
vi.mock("@/lib/tempThumbnailCache", () => ({
  peekTempThumbnail: vi.fn(),
  loadTempThumbnail: vi.fn(),
}));

import { loadTempThumbnail, peekTempThumbnail } from "@/lib/tempThumbnailCache";
import ProxiedImage from "../../../src/renderer/components/common/ProxiedImage.vue";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mountImage = (initial: { id: number; url: string; referer: string }) => {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);

  const state = reactive({ ...initial });
  const app = createApp({
    render: () =>
      h(ProxiedImage, {
        id: state.id,
        url: state.url,
        referer: state.referer,
      }),
  });
  app.mount(host);

  return { host, state, unmount: () => app.unmount() };
};

const imgSrc = (host: HTMLElement) =>
  host.querySelector("img")?.getAttribute("src") ?? null;

describe("ProxiedImage 슬롯 재사용", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본적으로 캐시는 비어있고, load는 호출 시점의 id/url로부터 경로를 만듭니다
    (peekTempThumbnail as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (loadTempThumbnail as ReturnType<typeof vi.fn>).mockImplementation(
      async (galleryId: number) => `/path/${galleryId}`,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("props.id/url이 바뀌면 옛 이미지를 버리고 새 이미지로 갱신한다", async () => {
    const { host, state, unmount } = mountImage({
      id: 1,
      url: "url-a",
      referer: "r",
    });
    await flush();
    await nextTick();

    // 최초 마운트: 갤러리 1의 표지가 그려진다
    expect(imgSrc(host)).toBe("/path/1");
    expect(loadTempThumbnail).toHaveBeenCalledTimes(1);

    // 슬롯 재사용: 같은 자리에 갤러리 2가 들어온다 (리사이즈 상황과 동일)
    state.id = 2;
    state.url = "url-b";
    await flush();
    await nextTick();

    // 옛 표지(/path/1)가 아니라 새 표지(/path/2)로 바뀌어야 한다
    expect(imgSrc(host)).toBe("/path/2");
    expect(loadTempThumbnail).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("같은 id/url이면 불필요한 재로드를 하지 않는다", async () => {
    const { host, state, unmount } = mountImage({
      id: 1,
      url: "url-a",
      referer: "r",
    });
    await flush();
    await nextTick();
    expect(loadTempThumbnail).toHaveBeenCalledTimes(1);

    // 동일한 이미지로의 사소한 리렌더는 재로드를 유발하지 않는다
    state.referer = "r2";
    await flush();
    await nextTick();

    expect(imgSrc(host)).toBe("/path/1");
    expect(loadTempThumbnail).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("새 id가 캐시에 있으면 즉시 표시한다", async () => {
    const { host, state, unmount } = mountImage({
      id: 1,
      url: "url-a",
      referer: "r",
    });
    await flush();
    await nextTick();
    expect(imgSrc(host)).toBe("/path/1");

    // 갤러리 2는 이미 캐시에 있다
    (peekTempThumbnail as ReturnType<typeof vi.fn>).mockImplementation(
      (_id: number, url: string) =>
        url === "url-b" ? "/cached/2" : undefined,
    );

    state.id = 2;
    state.url = "url-b";
    await nextTick();

    // 동기적으로 peek 결과가 즉시 반영된다 (빈 칸/깜빡임 없이)
    expect(imgSrc(host)).toBe("/cached/2");

    unmount();
  });
});
