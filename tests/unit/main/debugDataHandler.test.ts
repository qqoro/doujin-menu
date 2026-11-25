import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as yauzl from "yauzl";

const tempDir = mkdtempSync(join(tmpdir(), "doujin-menu-debug-test-"));
const logPath = join(tempDir, "main.log");
const dbPath = join(tempDir, "dev.sqlite3");
writeFileSync(logPath, "log line");
writeFileSync(dbPath, "sqlite bytes");

vi.mock("electron", () => ({
  app: {
    getPath: () => tempDir,
    getVersion: () => "1.29.1",
    getLocale: () => "ko",
  },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));

vi.mock("electron-log", () => ({
  default: {
    error: vi.fn(),
    transports: { file: { getFile: () => ({ path: logPath }) } },
  },
}));

const raw = vi.fn();
vi.mock("../../../src/main/db/index.ts", () => {
  const db = Object.assign(
    () => ({ count: () => ({ first: async () => ({ count: 3 }) }) }),
    { raw: (sql: string) => raw(sql) },
  );
  return { default: db };
});

vi.mock("../../../src/main/handlers/configHandler.ts", () => ({
  getDbPath: () => dbPath,
  store: {
    store: { theme: "dark", useAppLock: true, appLockPassword: "salt:hash" },
  },
}));

const { buildSettingsDump, writeDebugArchive } =
  await import("../../../src/main/handlers/debugDataHandler.js");

function readZip(zipPath: string): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      const files = new Map<string, string>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e);
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            files.set(entry.fileName, Buffer.concat(chunks).toString());
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(files));
      zip.readEntry();
    });
  });
}

describe("buildSettingsDump", () => {
  it("앱 잠금 비밀번호 해시는 빼고 나머지 설정을 담는다", () => {
    const dump = JSON.parse(
      buildSettingsDump({ theme: "dark", appLockPassword: "salt:hash" }),
    );
    expect(dump).toEqual({ theme: "dark" });
  });
});

describe("writeDebugArchive", () => {
  beforeEach(() => raw.mockClear());

  it("시스템 정보, 설정, 로그를 묶는다", async () => {
    const out = join(tempDir, "no-db.zip");
    await writeDebugArchive(out, false);

    const files = await readZip(out);
    expect([...files.keys()].sort()).toEqual([
      "main.log",
      "settings.json",
      "system-info.md",
    ]);
    expect(files.get("main.log")).toBe("log line");
    expect(files.get("settings.json")).not.toContain("salt:hash");
    expect(files.get("system-info.md")).toContain("| 책 수 | 3 |");
    expect(raw).not.toHaveBeenCalled();
  });

  it("DB를 넣을 때는 WAL을 먼저 반영한다", async () => {
    const out = join(tempDir, "with-db.zip");
    await writeDebugArchive(out, true);

    const files = await readZip(out);
    expect(files.get("database.db")).toBe("sqlite bytes");
    expect(raw).toHaveBeenCalledWith("PRAGMA wal_checkpoint(TRUNCATE);");
  });
});
