import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const windowSend = vi.fn();

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: windowSend } }],
  },
}));

import { broadcast, broadcastWeb } from "../../../src/main/utils/broadcast.js";
import { addWebClient } from "../../../src/main/web/eventHub.js";

describe("broadcast", () => {
  let chunks: string[];
  let remove: () => void;

  beforeEach(() => {
    windowSend.mockReset();
    chunks = [];
    remove = addWebClient({ id: "w", write: (c) => chunks.push(c) });
  });

  afterEach(() => {
    remove();
  });

  it("broadcast는 창과 웹 클라이언트 모두에 보낸다", () => {
    broadcast("books-updated");

    expect(windowSend).toHaveBeenCalledWith("books-updated");
    expect(chunks).toEqual(['data: {"channel":"books-updated"}\n\n']);
  });

  it("broadcastWeb은 웹 클라이언트에만 보낸다", () => {
    broadcastWeb("library-scan-completed");

    expect(windowSend).not.toHaveBeenCalled();
    expect(chunks).toEqual(['data: {"channel":"library-scan-completed"}\n\n']);
  });
});
