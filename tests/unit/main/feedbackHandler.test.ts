import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "fs";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const tempDir = mkdtempSync(join(tmpdir(), "doujin-menu-feedback-test-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => tempDir,
    getVersion: () => "1.29.1",
  },
  ipcMain: { handle: vi.fn() },
}));

vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockWriteDebugArchive = vi.fn(
  async (path: string, _includeDb: boolean) => {
    await writeFile(path, "zip-bytes");
  },
);
vi.mock("../../../src/main/handlers/debugDataHandler.js", () => ({
  buildDebugFilename: () => "doujin-menu-debug-v1.29.1-20261125.dmd",
  writeDebugArchive: (path: string, includeDb: boolean) =>
    mockWriteDebugArchive(path, includeDb),
}));

const { submitFeedback, FEEDBACK_MAX_FILE_BYTES } =
  await import("../../../src/main/handlers/feedbackHandler.js");

type Payload = Parameters<typeof submitFeedback>[0];

function payload(overrides: Partial<Payload> = {}): Payload {
  return {
    kind: "bug",
    content: "스캔이 멈춥니다",
    email: "",
    attachDebug: false,
    includeDb: false,
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ ok: true, id: 42 }));
  vi.stubGlobal("fetch", fetchMock);
  mockWriteDebugArchive.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentForm(): FormData {
  return fetchMock.mock.calls[0][1].body as FormData;
}

describe("submitFeedback", () => {
  it("앱 이름, 종류, 본문, 버전을 폼으로 보낸다", async () => {
    const result = await submitFeedback(
      payload({ content: "  본문  ", email: " a@b.co " }),
    );

    expect(result).toEqual({ ok: true, id: 42 });
    const form = sentForm();
    expect(form.get("app")).toBe("doujin-menu");
    expect(form.get("kind")).toBe("bug");
    expect(form.get("content")).toBe("본문");
    expect(form.get("email")).toBe("a@b.co");
    expect(form.get("version")).toMatch(/^1\.29\.1/);
    expect(form.get("file")).toBeNull();
    expect(mockWriteDebugArchive).not.toHaveBeenCalled();
  });

  it("디버그 데이터를 첨부하고 임시 파일을 지운다", async () => {
    await submitFeedback(payload({ attachDebug: true, includeDb: true }));

    expect(mockWriteDebugArchive).toHaveBeenCalledWith(
      expect.any(String),
      true,
    );
    const archivePath = mockWriteDebugArchive.mock.calls[0][0];
    const file = sentForm().get("file") as File;
    expect(file.name).toBe("doujin-menu-debug-v1.29.1-20261125.dmd");
    expect(await file.text()).toBe("zip-bytes");
    expect(existsSync(archivePath)).toBe(false);
  });

  it("첨부 파일이 한도를 넘으면 보내지 않고 too-large", async () => {
    mockWriteDebugArchive.mockImplementationOnce(async (path: string) => {
      await writeFile(path, Buffer.alloc(FEEDBACK_MAX_FILE_BYTES + 1));
    });

    const result = await submitFeedback(payload({ attachDebug: true }));

    expect(result).toEqual({
      ok: false,
      reason: "too-large",
      size: FEEDBACK_MAX_FILE_BYTES + 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(mockWriteDebugArchive.mock.calls[0][0])).toBe(false);
  });

  it("Worker 응답 코드를 실패 사유로 바꾼다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    expect(await submitFeedback(payload())).toEqual({
      ok: false,
      reason: "rate-limited",
    });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 413 }));
    expect(await submitFeedback(payload())).toEqual({
      ok: false,
      reason: "too-large",
    });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
    expect(await submitFeedback(payload())).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("네트워크 오류는 failed", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await submitFeedback(payload())).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("빈 본문, 3000자 초과, 잘못된 이메일은 거절한다", async () => {
    await expect(submitFeedback(payload({ content: "   " }))).rejects.toThrow();
    await expect(
      submitFeedback(payload({ content: "가".repeat(3001) })),
    ).rejects.toThrow();
    await expect(submitFeedback(payload({ email: "abc@" }))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
