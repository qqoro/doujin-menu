import type { TypedIpcRenderer } from "../../types/ipc";

export interface WebIpcDeps {
  fetch: typeof fetch;
  EventSource: new (url: string) => EventSource;
  clientId: string;
  openUrl(url: string): void;
  navigate(path: string): void;
  /** 끊겼던 이벤트 연결이 다시 열렸을 때. 그 사이 놓친 변경을 다시 불러오게 한다 */
  onReconnect?(): void;
  /** PC에서 이 기기를 해제했거나 페어링이 안 된 상태 */
  onUnauthorized?(): void;
  /** 이벤트 연결이 끊기거나 다시 붙을 때. 같은 값은 연달아 오지 않는다 */
  onConnectionChange?(connected: boolean): void;
}

export class WebUnauthorizedError extends Error {}

// EventSource.CLOSED. 테스트의 가짜 구현에도 같은 값을 쓴다
const SOURCE_CLOSED = 2;
const RECONNECT_DELAY_MS = 3000;

/**
 * 창 상태를 묻는 채널. 메인의 핸들러가 `BrowserWindow.fromWebContents(event.sender)`를
 * 부르므로 웹 요청으로 보내지 않고 여기서 답한다.
 */
export const LOCAL_INVOKE_RESPONSES: Readonly<Record<string, unknown>> = {
  "is-fullscreen-window": false,
  "is-new-window": false,
  "get-window-maximized-state": false,
};

type Listener = (event: unknown, payload?: unknown) => void;

/**
 * Electron `ipcRenderer`와 같은 모양으로 HTTP(+SSE)를 쓰는 구현.
 * 휴대폰 브라우저에서 `api.ts`가 이걸 쓴다.
 */
export function createWebIpcRenderer(deps: WebIpcDeps): TypedIpcRenderer {
  const listeners = new Map<string, Set<Listener>>();
  let source: EventSource | null = null;
  let hasOpened = false;
  let connected = true;

  const setConnected = (value: boolean) => {
    if (connected === value) return;
    connected = value;
    deps.onConnectionChange?.(value);
  };

  // EventSource는 응답 코드를 알려 주지 않으므로 401인지 따로 물어본다
  const isUnauthorized = () =>
    deps
      .fetch("/api/session")
      .then((res) => res.status === 401)
      .catch(() => false);

  const ensureSource = () => {
    if (source) return;
    const current = new deps.EventSource(
      `/api/events?clientId=${encodeURIComponent(deps.clientId)}`,
    );
    source = current;
    current.onopen = () => {
      setConnected(true);
      if (hasOpened) deps.onReconnect?.();
      hasOpened = true;
    };
    // 휴대폰이 잠들었다 깨는 네트워크 오류는 EventSource가 스스로 다시 붙는다.
    // 하지만 PC 앱 재시작 중처럼 200이 아닌 응답을 받으면 CLOSED가 되어 영영 포기하므로
    // 그때는 새로 만든다.
    current.onerror = () => {
      setConnected(false);
      if (current.readyState !== SOURCE_CLOSED || source !== current) return;
      source = null;
      void isUnauthorized().then((unauthorized) => {
        if (unauthorized) {
          deps.onUnauthorized?.();
          return;
        }
        setTimeout(() => {
          if (listeners.size > 0) ensureSource();
        }, RECONNECT_DELAY_MS);
      });
    };
    current.onmessage = (message: MessageEvent<string>) => {
      const { channel, payload } = JSON.parse(message.data) as {
        channel: string;
        payload?: unknown;
      };
      for (const listener of listeners.get(channel) ?? []) {
        if (payload === undefined) listener({});
        else listener({}, payload);
      }
    };
  };

  const invoke = async (channel: string, ...args: unknown[]) => {
    if (channel in LOCAL_INVOKE_RESPONSES) {
      return LOCAL_INVOKE_RESPONSES[channel];
    }

    // JSON은 undefined를 null로 바꾸고, null에는 핸들러의 기본 매개변수가 적용되지 않는다
    let end = args.length;
    while (end > 0 && args[end - 1] === undefined) end--;

    const res = await deps.fetch(`/api/invoke/${encodeURIComponent(channel)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-id": deps.clientId,
      },
      body: JSON.stringify(args.slice(0, end)),
    });
    const body = (await res.json().catch(() => ({}))) as {
      result?: unknown;
      error?: string;
    };
    if (res.status === 401) {
      deps.onUnauthorized?.();
      throw new WebUnauthorizedError(body.error ?? "연결이 필요합니다.");
    }
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body.result;
  };

  const send = (channel: string, ...args: unknown[]) => {
    if (channel === "open-external-link") deps.openUrl(String(args[0]));
    else if (channel === "open-new-window") deps.navigate(String(args[0]));
  };

  return {
    invoke: invoke as TypedIpcRenderer["invoke"],
    send: send as TypedIpcRenderer["send"],
    on(channel, listener) {
      ensureSource();
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      set.add(listener as Listener);
    },
    off(channel, listener) {
      listeners.get(channel)?.delete(listener as Listener);
    },
    removeAllListeners(channel) {
      listeners.delete(channel);
    },
  };
}
