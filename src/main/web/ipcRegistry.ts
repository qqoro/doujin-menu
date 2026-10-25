export type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown;

type HandleTarget = {
  handle(channel: string, listener: InvokeHandler): void;
};

const handlers = new Map<string, InvokeHandler>();

/**
 * `ipc.handle`을 감싸 등록되는 핸들러를 따로 기록한다.
 * 모바일 웹 서버가 같은 핸들러를 HTTP로 부를 수 있게 하기 위해서다.
 * 핸들러 등록(register*Handlers)보다 먼저 불러야 한다.
 */
export function captureIpcHandlers(ipc: HandleTarget): void {
  const original = ipc.handle.bind(ipc);
  ipc.handle = (channel, listener) => {
    handlers.set(channel, listener);
    original(channel, listener);
  };
}

export function getInvokeHandler(channel: string): InvokeHandler | undefined {
  return handlers.get(channel);
}

export function resetIpcRegistryForTest(): void {
  handlers.clear();
}
