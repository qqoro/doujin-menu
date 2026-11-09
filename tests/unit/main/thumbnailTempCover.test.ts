import { beforeEach, describe, expect, it, vi } from "vitest";

const { FakeWorker, state, rm, extractCoverFromZip } = vi.hoisted(() => {
  type Handler = (message: unknown) => void;

  const state = {
    book: { id: 1, path: "", is_offline: 0 },
    isDirectory: false,
    workerStatus: "success",
  };

  class FakeWorker {
    private handlers: Handler[] = [];

    on(event: string, handler: Handler) {
      if (event === "message") this.handlers.push(handler);
      return this;
    }

    off(_event: string, handler: Handler) {
      this.handlers = this.handlers.filter((h) => h !== handler);
      return this;
    }

    postMessage({ bookId }: { bookId: number }) {
      queueMicrotask(() => {
        for (const handler of [...this.handlers]) {
          handler({ status: state.workerStatus, bookId, error: "실패" });
        }
      });
    }

    terminate() {
      return Promise.resolve(0);
    }
  }

  return {
    FakeWorker,
    state,
    rm: vi.fn(() => Promise.resolve()),
    extractCoverFromZip: vi.fn((_zip: string, output: string) =>
      Promise.resolve<string | null>(output),
    ),
  };
});

vi.mock("worker_threads", () => ({ Worker: FakeWorker }));

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
  extractCoverFromZip,
}));

vi.mock("../../../src/main/db/index.js", () => ({
  default: () => ({
    where: () => ({ first: () => Promise.resolve(state.book) }),
  }),
}));

vi.mock("fs/promises", () => ({
  default: {
    stat: () => Promise.resolve({ isDirectory: () => state.isDirectory }),
    readdir: () => Promise.resolve(["000001.webp"]),
    mkdir: () => Promise.resolve(undefined),
    rm,
  },
}));

import { generateThumbnailForBook } from "../../../src/main/handlers/thumbnailHandler.js";

const TEMP_COVER = expect.stringContaining("1_temp_cover.webp");

beforeEach(() => {
  rm.mockClear();
  extractCoverFromZip.mockClear();
  state.isDirectory = false;
  state.workerStatus = "success";
  state.book = { id: 1, path: "C:\\books\\a.cbz", is_offline: 0 };
});

describe("압축 책의 임시 표지", () => {
  it("썸네일을 만든 뒤 지운다", async () => {
    await expect(generateThumbnailForBook(1)).resolves.toMatchObject({
      bookId: 1,
    });

    expect(rm).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledWith(TEMP_COVER, { force: true });
  });

  it("썸네일 생성이 실패해도 지운다", async () => {
    state.workerStatus = "error";

    await expect(generateThumbnailForBook(1)).resolves.toBeNull();

    expect(rm).toHaveBeenCalledWith(TEMP_COVER, { force: true });
  });

  it("임시 표지를 지우지 못해도 썸네일 결과는 그대로 돌려준다", async () => {
    rm.mockRejectedValueOnce(new Error("잠김"));

    await expect(generateThumbnailForBook(1)).resolves.toMatchObject({
      bookId: 1,
    });
  });
});

describe("원본을 그대로 쓰는 책", () => {
  it("폴더 책의 첫 페이지는 지우지 않는다", async () => {
    state.isDirectory = true;
    state.book = { id: 1, path: "C:\\Temp\\책", is_offline: 0 };

    await generateThumbnailForBook(1);

    expect(rm).not.toHaveBeenCalled();
  });

  it("단일 이미지 책은 지우지 않는다", async () => {
    state.book = { id: 1, path: "C:\\Temp\\a.jpg", is_offline: 0 };

    await generateThumbnailForBook(1);

    expect(rm).not.toHaveBeenCalled();
  });
});
