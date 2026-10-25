import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWebIpcRenderer,
  WebUnauthorizedError,
  type WebIpcDeps,
} from "@/lib/webIpc";

class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  /** 네트워크 오류: 브라우저가 스스로 다시 붙는다 */
  fail() {
    this.readyState = 0;
    this.onerror?.();
  }
  /** 200이 아닌 응답(PC 앱 재시작 중 502 등): 브라우저가 포기한다 */
  failPermanently() {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createWebIpcRenderer", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let openUrl: ReturnType<typeof vi.fn<(url: string) => void>>;
  let navigate: ReturnType<typeof vi.fn<(path: string) => void>>;

  const create = () =>
    createWebIpcRenderer({
      fetch: fetchMock as unknown as typeof fetch,
      EventSource: FakeEventSource as unknown as new (
        url: string,
      ) => EventSource,
      clientId: "c1",
      openUrl,
      navigate,
    });

  beforeEach(() => {
    FakeEventSource.instances = [];
    fetchMock = vi.fn(async () => jsonResponse(200, { result: "ok" }));
    openUrl = vi.fn();
    navigate = vi.fn();
  });

  it("invoke는 채널 경로로 인자 배열을 POST하고 result를 돌려준다", async () => {
    const ipc = create();
    await expect(ipc.invoke("get-book", 3)).resolves.toBe("ok");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/invoke/get-book");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("[3]");
    expect((init.headers as Record<string, string>)["x-client-id"]).toBe("c1");
  });

  it("끝에 붙은 undefined 인자는 보내지 않는다", async () => {
    const ipc = create() as unknown as {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    };
    await ipc.invoke("get-books", { a: 1 }, undefined);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('[{"a":1}]');
  });

  it("오류 응답은 서버가 준 메시지로 거부한다", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "PC에서만 사용할 수 있는 기능입니다." }),
    );
    const ipc = create();
    await expect(ipc.invoke("select-folder")).rejects.toThrow(
      "PC에서만 사용할 수 있는 기능입니다.",
    );
  });

  it("창 상태를 묻는 채널은 서버에 묻지 않고 false를 돌려준다", async () => {
    const ipc = create();
    await expect(ipc.invoke("is-new-window")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("send는 외부 링크와 새 창만 브라우저에서 처리하고 나머지는 무시한다", () => {
    const ipc = create();
    ipc.send("open-external-link", "https://x");
    ipc.send("open-new-window", "/viewer/3");
    ipc.send("minimize-window");

    expect(openUrl).toHaveBeenCalledWith("https://x");
    expect(navigate).toHaveBeenCalledWith("/viewer/3");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("구독은 EventSource 하나로 받고 채널별 리스너에만 전달한다", () => {
    const ipc = create();
    const onBooks = vi.fn();
    const onQueue = vi.fn();
    ipc.on("books-updated", onBooks);
    ipc.on("download-queue-updated", onQueue);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/events?clientId=c1");

    FakeEventSource.instances[0].emit({ channel: "books-updated" });
    expect(onBooks).toHaveBeenCalledTimes(1);
    expect(onQueue).not.toHaveBeenCalled();
  });

  it("페이로드가 있는 이벤트는 두 번째 인자로 넘긴다", () => {
    const ipc = create();
    const listener = vi.fn();
    ipc.on("window-maximized", listener);

    FakeEventSource.instances[0].emit({
      channel: "window-maximized",
      payload: true,
    });
    expect(listener).toHaveBeenCalledWith({}, true);
  });

  it("연결이 끊겼다 이어져도 기존 리스너가 살아 있고 EventSource를 새로 만들지 않는다", () => {
    const ipc = create();
    const listener = vi.fn();
    ipc.on("books-updated", listener);

    FakeEventSource.instances[0].fail();
    FakeEventSource.instances[0].emit({ channel: "books-updated" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("연결이 아예 닫히면 잠시 뒤 다시 연결하고, 다시 열리면 onReconnect를 부른다", async () => {
    vi.useFakeTimers();
    try {
      const onReconnect = vi.fn();
      const ipc = createWebIpcRenderer({
        fetch: fetchMock as unknown as typeof fetch,
        EventSource: FakeEventSource as unknown as new (
          url: string,
        ) => EventSource,
        clientId: "c1",
        openUrl,
        navigate,
        onReconnect,
      });
      const listener = vi.fn();
      ipc.on("books-updated", listener);
      FakeEventSource.instances[0].open();
      expect(onReconnect).not.toHaveBeenCalled();

      FakeEventSource.instances[0].failPermanently();
      await vi.advanceTimersByTimeAsync(5000);
      expect(FakeEventSource.instances).toHaveLength(2);

      FakeEventSource.instances[1].open();
      expect(onReconnect).toHaveBeenCalledTimes(1);
      FakeEventSource.instances[1].emit({ channel: "books-updated" });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("off는 그 리스너만, removeAllListeners는 그 채널 전체를 지운다", () => {
    const ipc = create();
    const a = vi.fn();
    const b = vi.fn();
    ipc.on("books-updated", a);
    ipc.on("books-updated", b);
    ipc.off("books-updated", a);

    FakeEventSource.instances[0].emit({ channel: "books-updated" });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);

    ipc.removeAllListeners("books-updated");
    FakeEventSource.instances[0].emit({ channel: "books-updated" });
    expect(b).toHaveBeenCalledTimes(1);
  });

  describe("인증과 연결 상태", () => {
    const createWith = (extra: Partial<WebIpcDeps>) =>
      createWebIpcRenderer({
        fetch: fetchMock as unknown as typeof fetch,
        EventSource: FakeEventSource as unknown as new (
          url: string,
        ) => EventSource,
        clientId: "c1",
        openUrl,
        navigate,
        ...extra,
      });

    it("401이면 onUnauthorized를 부르고 WebUnauthorizedError로 거부한다", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(401, { error: "연결이 필요합니다." }),
      );
      const onUnauthorized = vi.fn();
      const ipc = createWith({ onUnauthorized });
      await expect(ipc.invoke("get-config")).rejects.toBeInstanceOf(
        WebUnauthorizedError,
      );
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("연결이 닫혔을 때 세션이 401이면 다시 붙지 않고 onUnauthorized를 부른다", async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
        const onUnauthorized = vi.fn();
        const ipc = createWith({ onUnauthorized });
        ipc.on("books-updated", vi.fn());
        FakeEventSource.instances[0].open();
        FakeEventSource.instances[0].failPermanently();
        await vi.advanceTimersByTimeAsync(5000);
        expect(fetchMock).toHaveBeenCalledWith("/api/session");
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
        expect(FakeEventSource.instances).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("세션 확인이 204면 3초 뒤 다시 붙는다", async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
        const ipc = createWith({});
        ipc.on("books-updated", vi.fn());
        FakeEventSource.instances[0].failPermanently();
        await vi.advanceTimersByTimeAsync(2999);
        expect(FakeEventSource.instances).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(FakeEventSource.instances).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("세션 확인조차 실패하면(PC 꺼짐) 다시 붙기를 계속 시도한다", async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const onUnauthorized = vi.fn();
        const ipc = createWith({ onUnauthorized });
        ipc.on("books-updated", vi.fn());
        FakeEventSource.instances[0].failPermanently();
        await vi.advanceTimersByTimeAsync(3000);
        expect(FakeEventSource.instances).toHaveLength(2);
        expect(onUnauthorized).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("연결 상태가 바뀔 때만 onConnectionChange를 부른다", () => {
      const onConnectionChange = vi.fn();
      const ipc = createWith({ onConnectionChange });
      ipc.on("books-updated", vi.fn());
      const source = FakeEventSource.instances[0];
      source.open();
      source.fail();
      source.fail();
      source.open();
      expect(onConnectionChange.mock.calls).toEqual([[false], [true]]);
    });
  });
});
