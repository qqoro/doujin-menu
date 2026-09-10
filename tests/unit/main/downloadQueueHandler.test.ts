import type { Knex } from "knex";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: { get: (_key: string, fallback: unknown) => fallback },
}));

const broadcast = vi.fn();
vi.mock("../../../src/main/utils/broadcast.js", () => ({
  broadcast: (...args: unknown[]) => broadcast(...args),
  sendTo: vi.fn(),
}));

// 실제 다운로드는 타지 않는다. 큐의 상태 전이만 본다.
const downloadGallery = vi.fn();
vi.mock("../../../src/main/handlers/downloaderHandler.js", () => ({
  handleDownloadGallery: (...args: unknown[]) => downloadGallery(...args),
}));

vi.mock("node-hitomi", () => ({
  default: { getGallery: vi.fn(() => Promise.resolve(null)) },
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import { createTestDb } from "../../../src/main/db/test-utils.js";
import {
  handleAddToDownloadQueue,
  handleClearCompletedDownloads,
  handleGetDownloadQueue,
  handlePauseDownload,
  handleResumeDownload,
  handleRetryDownload,
  updateQueueItemStatus,
} from "../../../src/main/handlers/downloadQueueHandler.js";

let db: Knex;

const addItem = (galleryId: number, overrides: Record<string, unknown> = {}) =>
  db("DownloadQueue").insert({
    source: "hitomi",
    source_key: String(galleryId),
    gallery_id: galleryId,
    gallery_title: `갤러리 ${galleryId}`,
    download_path: "C:\\down",
    status: "pending",
    progress: 0,
    total_files: 0,
    downloaded_files: 0,
    priority: 0,
    added_at: new Date().toISOString(),
    ...overrides,
  });

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await db("DownloadQueue").delete();
  broadcast.mockClear();
  downloadGallery.mockReset();
});

describe("handleGetDownloadQueue", () => {
  it("우선순위 내림차순, 추가 순 오름차순으로 정렬한다", async () => {
    await addItem(1, { priority: 0, added_at: "2026-01-01T00:00:00.000Z" });
    await addItem(2, { priority: 5, added_at: "2026-01-02T00:00:00.000Z" });
    await addItem(3, { priority: 0, added_at: "2026-01-03T00:00:00.000Z" });

    const result = await handleGetDownloadQueue();

    expect(result.success).toBe(true);
    expect(result.data?.map((item) => item.gallery_id)).toStrictEqual([
      2, 1, 3,
    ]);
  });
});

describe("handleAddToDownloadQueue", () => {
  it("같은 갤러리를 두 번 넣지 않는다", async () => {
    await addItem(100);

    const result = await handleAddToDownloadQueue({
      galleryId: 100,
      galleryTitle: "중복",
      downloadPath: "C:\\down",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("이미");
    expect(await db("DownloadQueue").count("* as c").first()).toMatchObject({
      c: 1,
    });
  });

  it("galleryId를 그대로 source_key로 적는다", async () => {
    const result = await handleAddToDownloadQueue({
      galleryId: 3241234,
      galleryTitle: "[작가] 제목",
      downloadPath: "C:\\down",
    });

    expect(result.success).toBe(true);
    const row = await db("DownloadQueue").where("gallery_id", 3241234).first();
    expect(row.source).toBe("hitomi");
    expect(row.source_key).toBe("3241234");
  });
});

describe("handlePauseDownload", () => {
  it("다운로드 중인 항목을 paused로 바꾼다", async () => {
    const [id] = await addItem(200, { status: "downloading" });

    const result = await handlePauseDownload(id);

    expect(result.success).toBe(true);
    const row = await db("DownloadQueue").where("id", id).first();
    expect(row.status).toBe("paused");
  });

  it("다운로드 중이 아닌 항목은 거절한다", async () => {
    const [id] = await addItem(201, { status: "pending" });

    const result = await handlePauseDownload(id);

    expect(result.success).toBe(false);
    expect(result.error).toContain("다운로드 중인 항목만");
  });
});

describe("handleResumeDownload", () => {
  it("일시정지된 항목을 pending으로 되돌린다", async () => {
    const [id] = await addItem(210, { status: "paused" });

    const result = await handleResumeDownload(id);

    expect(result.success).toBe(true);
    const row = await db("DownloadQueue").where("id", id).first();
    expect(row.status).toBe("pending");
  });
});

describe("handleRetryDownload", () => {
  it("실패한 항목만 pending으로 되돌린다", async () => {
    const [id] = await addItem(300, {
      status: "failed",
      progress: 42,
      downloaded_files: 7,
      error_message: "10회 실패",
    });

    const result = await handleRetryDownload(id);

    expect(result.success).toBe(true);
    const row = await db("DownloadQueue").where("id", id).first();
    expect(row.status).toBe("pending");
    expect(row.progress).toBe(0);
    expect(row.downloaded_files).toBe(0);
    expect(row.error_message).toBeNull();
  });

  it("실패 상태가 아니면 거절한다", async () => {
    const [id] = await addItem(301, { status: "completed" });

    const result = await handleRetryDownload(id);

    expect(result.success).toBe(false);
    expect(result.error).toContain("실패한 항목만");
  });
});

describe("updateQueueItemStatus", () => {
  it("완료 시 진행률을 100으로 맞추고 완료 시각을 남긴다", async () => {
    const [id] = await addItem(400, { progress: 13 });

    await updateQueueItemStatus(id, "completed");

    const row = await db("DownloadQueue").where("id", id).first();
    expect(row.status).toBe("completed");
    expect(row.progress).toBe(100);
    expect(row.completed_at).toBeTruthy();
  });

  it("실패 사유를 저장한다", async () => {
    const [id] = await addItem(401);

    await updateQueueItemStatus(id, "failed", {
      errorMessage: "000005.webp 다운로드를 10회 시도했지만 실패했습니다.",
    });

    const row = await db("DownloadQueue").where("id", id).first();
    expect(row.status).toBe("failed");
    expect(row.error_message).toContain("10회");
  });
});

describe("handleClearCompletedDownloads", () => {
  it("완료 항목만 지운다", async () => {
    await addItem(500, { status: "completed" });
    await addItem(501, { status: "failed" });
    await addItem(502, { status: "pending" });

    await handleClearCompletedDownloads();

    const remaining = await db("DownloadQueue").select("gallery_id");
    expect(remaining.map((r) => r.gallery_id).sort()).toStrictEqual([501, 502]);
  });
});
