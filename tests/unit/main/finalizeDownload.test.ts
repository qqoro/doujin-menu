import { beforeEach, describe, expect, it, vi } from "vitest";

const config: Record<string, unknown> = {};
vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: {
    get: (key: string, fallback: unknown) => config[key] ?? fallback,
  },
}));

const scanFile = vi.fn();
vi.mock("../../../src/main/handlers/directoryHandler.js", () => ({
  scanFile: (...args: unknown[]) => scanFile(...args),
}));

import { finalizeDownload } from "../../../src/main/services/download/finalize.js";

beforeEach(() => {
  scanFile.mockClear();
  config.libraryFolders = ["D:\\Comics"];
});

describe("finalizeDownload", () => {
  it("라이브러리 폴더 안에 받으면 스캔한다", async () => {
    await finalizeDownload("D:\\Comics\\책");
    expect(scanFile).toHaveBeenCalledWith("D:\\Comics\\책");
  });

  it("대소문자만 달라도 라이브러리 안으로 본다", async () => {
    await finalizeDownload("d:\\comics\\책");
    expect(scanFile).toHaveBeenCalledOnce();
  });

  it("이름 앞부분만 겹치는 이웃 폴더는 스캔하지 않는다", async () => {
    await finalizeDownload("D:\\Comics2\\책");
    expect(scanFile).not.toHaveBeenCalled();
  });
});
