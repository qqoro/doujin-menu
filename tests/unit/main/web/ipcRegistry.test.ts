import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureIpcHandlers,
  getInvokeHandler,
  resetIpcRegistryForTest,
} from "../../../../src/main/web/ipcRegistry.js";

describe("ipcRegistry", () => {
  beforeEach(() => {
    resetIpcRegistryForTest();
  });

  it("등록된 핸들러를 기록하면서 원래 handle도 그대로 호출한다", () => {
    const original = vi.fn();
    const fake = { handle: original };
    captureIpcHandlers(fake);

    const handler = () => "ok";
    fake.handle("a", handler);

    expect(getInvokeHandler("a")).toBe(handler);
    expect(original).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledWith("a", handler);
  });

  it("등록되지 않은 채널은 undefined를 돌려준다", () => {
    expect(getInvokeHandler("missing")).toBeUndefined();
  });
});
