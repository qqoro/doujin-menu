import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { ZipArchive } from "archiver";
import * as fsSync from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: {},
}));

vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../../src/main/db/index.js", () => ({ default: {} }));

const libraryFolders: string[] = [];
vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: { get: vi.fn(() => libraryFolders) },
}));

vi.mock("../../../src/main/utils/broadcast.js", () => ({
  sendTo: vi.fn(),
  broadcast: vi.fn(),
}));

const retrieve = vi.fn(async (id: number) => ({ id }));
vi.mock("../../../src/main/services/hitomi/client.js", () => ({
  hitomi: { galleries: { retrieve: (id: number) => retrieve(id) } },
}));

vi.mock("../../../src/main/services/hitomi/gallery.js", () => ({
  buildInfoContent: (gallery: { id: number }) => `갤러리 넘버: ${gallery.id}`,
}));

import { handleGenerateMissingInfoFiles } from "../../../src/main/handlers/etcHandler.js";

const PATTERN = String.raw`\((\d+)\)$`;
const event = { sender: {} } as IpcMainInvokeEvent;

let lib: string;

async function createZip(zipPath: string, withInfo = false) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const output = fsSync.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 0 } });
    output.on("close", () => resolvePromise());
    archive.on("error", rejectPromise);
    archive.pipe(output);
    archive.append(Buffer.from("img"), { name: "001.jpg" });
    if (withInfo) archive.append(Buffer.from("제목: 안"), { name: "info.txt" });
    archive.finalize();
  });
}

describe("info.txt 일괄 생성", () => {
  beforeAll(async () => {
    lib = await fs.mkdtemp(path.join(os.tmpdir(), "info-gen-"));
    libraryFolders.push(lib);
  });

  beforeEach(async () => {
    retrieve.mockClear();
    for (const entry of await fs.readdir(lib)) {
      await fs.rm(path.join(lib, entry), { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await fs.rm(lib, { recursive: true, force: true });
  });

  it("압축 파일은 확장자를 뺀 이름으로 찾고 옆 파일로 쓴다", async () => {
    const zipPath = path.join(lib, "작품 (123).cbz");
    await createZip(zipPath);

    const result = await handleGenerateMissingInfoFiles(event, PATTERN);

    expect(result.data.createdCount).toBe(1);
    expect(retrieve).toHaveBeenCalledWith(123);
    expect(await fs.readFile(`${zipPath}.info.txt`, "utf-8")).toBe(
      "갤러리 넘버: 123",
    );
  });

  it("압축 안에 info.txt가 있으면 건너뛴다", async () => {
    const zipPath = path.join(lib, "작품 (124).zip");
    await createZip(zipPath, true);

    const result = await handleGenerateMissingInfoFiles(event, PATTERN);

    expect(result.data.createdCount).toBe(0);
    expect(retrieve).not.toHaveBeenCalled();
    await expect(fs.access(`${zipPath}.info.txt`)).rejects.toThrow();
  });

  it("옆 파일이 이미 있으면 압축도 폴더도 건너뛴다", async () => {
    const zipPath = path.join(lib, "작품 (125).cbz");
    await createZip(zipPath);
    await fs.writeFile(`${zipPath}.info.txt`, "제목: 옆");
    const folder = path.join(lib, "폴더 (126)");
    await fs.mkdir(folder);
    await fs.writeFile(`${folder}.info.txt`, "제목: 옆");

    const result = await handleGenerateMissingInfoFiles(event, PATTERN);

    expect(result.data.createdCount).toBe(0);
    await expect(fs.access(path.join(folder, "info.txt"))).rejects.toThrow();
  });

  it("폴더는 지금처럼 폴더 안에 info.txt를 만든다", async () => {
    const folder = path.join(lib, "폴더 (127)");
    await fs.mkdir(folder);

    const result = await handleGenerateMissingInfoFiles(event, PATTERN);

    expect(result.data.createdCount).toBe(1);
    expect(await fs.readFile(path.join(folder, "info.txt"), "utf-8")).toBe(
      "갤러리 넘버: 127",
    );
  });
});
