import { describe, expect, it, vi } from "vitest";

/**
 * 워커 크래시(error/exit)는 message를 보내지 않는다. 풀이 그 경로를 처리하지
 * 못하면 호출자의 Promise가 영원히 미결로 남고 풀이 말라붙는다.
 */
const { FakeWorker } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class FakeWorker {
    static instances: FakeWorker[] = [];

    private handlers = new Map<string, Handler[]>();
    postMessage = vi.fn();
    terminate = vi.fn(() => {
      this.emit("exit", 1);
      return Promise.resolve(0);
    });

    constructor() {
      FakeWorker.instances.push(this);
    }

    on(event: string, handler: Handler) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
      return this;
    }

    off(event: string, handler: Handler) {
      const list = this.handlers.get(event) ?? [];
      this.handlers.set(
        event,
        list.filter((h) => h !== handler),
      );
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of [...(this.handlers.get(event) ?? [])]) {
        handler(...args);
      }
    }

    hasListener(event: string) {
      return (this.handlers.get(event) ?? []).length > 0;
    }

    succeed(bookId: number, thumbnailPath: string) {
      this.emit("message", { status: "success", bookId, thumbnailPath });
    }

    crash() {
      this.emit("error", new Error("boom"));
    }
  }

  return { FakeWorker };
});

vi.mock("worker_threads", () => ({
  Worker: FakeWorker,
}));

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData" },
  ipcMain: { handle: vi.fn() },
}));

vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), time: vi.fn() },
}));

vi.mock("../../../src/main/utils/broadcast.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("../../../src/main/handlers/directoryHandler.js", () => ({
  extractCoverFromZip: vi.fn(),
}));

vi.mock("../../../src/main/db/index.js", () => ({
  default: () => ({
    where: () => ({
      first: () =>
        Promise.resolve({
          id: 1,
          path: "C:\\books\\single.jpg",
          is_offline: 0,
        }),
      update: () => Promise.resolve(1),
    }),
  }),
}));

vi.mock("fs/promises", () => ({
  default: {
    stat: () => Promise.resolve({ isDirectory: () => false }),
    readdir: () => Promise.resolve([]),
    mkdir: () => Promise.resolve(undefined),
  },
}));

import { generateThumbnailForBook } from "../../../src/main/handlers/thumbnailHandler.js";

/** 이번 호출에서 실제로 작업을 받은 워커를 집어온다 */
async function takeBusyWorker(): Promise<InstanceType<typeof FakeWorker>> {
  let busy: InstanceType<typeof FakeWorker> | undefined;
  await vi.waitFor(() => {
    busy = FakeWorker.instances.find(
      (w) => w.postMessage.mock.calls.length > 0,
    );
    expect(busy).toBeDefined();
  });
  busy!.postMessage.mockClear();
  return busy!;
}

// 워커 풀은 모듈 수준 싱글턴이라 테스트가 순서대로 이어진다.
describe("썸네일 워커 풀", () => {
  it("첫 요청 전에는 워커를 만들지 않는다", () => {
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("워커 응답이 오면 결과를 돌려준다", async () => {
    const promise = generateThumbnailForBook(1);
    const worker = await takeBusyWorker();

    worker.succeed(1, "/mock/userData/thumbnails/1.webp");

    await expect(promise).resolves.toMatchObject({ bookId: 1 });
  });

  it("워커가 크래시해도 호출자가 매달리지 않고, 교체 워커는 정확히 하나만 생긴다", async () => {
    const promise = generateThumbnailForBook(1);
    const worker = await takeBusyWorker();
    const countBefore = FakeWorker.instances.length;

    worker.crash();

    // generateThumbnailForBook은 내부에서 catch하고 null을 돌려준다.
    // 예전 구현은 message가 오지 않아 여기서 영원히 멈췄다.
    await expect(promise).resolves.toBeNull();

    // error → terminate → exit 양쪽에서 교체하면 하나에 둘이 생긴다.
    expect(FakeWorker.instances.length).toBe(countBefore + 1);
  });

  it("교체 워커에도 수명 이벤트가 붙어 있다", () => {
    const replacement = FakeWorker.instances[FakeWorker.instances.length - 1];

    expect(replacement.hasListener("error")).toBe(true);
    expect(replacement.hasListener("exit")).toBe(true);
  });

  it("크래시 이후에도 다음 작업이 정상 처리된다", async () => {
    const promise = generateThumbnailForBook(1);
    const worker = await takeBusyWorker();

    worker.succeed(1, "/mock/userData/thumbnails/1.webp");

    await expect(promise).resolves.toMatchObject({ bookId: 1 });
  });
});
