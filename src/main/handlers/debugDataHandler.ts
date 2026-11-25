import { ZipArchive } from "archiver";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import log from "electron-log";
import { createWriteStream, existsSync } from "fs";
import { stat } from "fs/promises";
import os from "os";
import db from "../db/index.js";
import type { Config } from "./configHandler.js";
import { getDbPath, store as configStore } from "./configHandler.js";

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function getLogPath(): string {
  return log.transports.file.getFile().path;
}

export function buildDebugFilename(): string {
  return `doujin-menu-debug-v${app.getVersion()}-${formatDate(new Date())}.dmd`;
}

/** 앱 잠금 비밀번호 해시는 디버그 파일에 넣지 않는다 */
export function buildSettingsDump(config: Partial<Config>): string {
  const { appLockPassword: _omit, ...rest } = config;
  return JSON.stringify(rest, null, 2);
}

async function buildSystemInfo(): Promise<string> {
  const dbPath = getDbPath();
  const logPath = getLogPath();

  let bookCount = "조회 실패";
  try {
    const row = await db("Book").count("* as count").first();
    bookCount = String(Number(row?.count ?? 0));
  } catch {
    // DB가 고장 났을 때도 디버그 파일은 만들어져야 한다
  }
  let dbSize = "없음";
  if (existsSync(dbPath)) {
    dbSize = formatFileSize((await stat(dbPath)).size);
  }

  return [
    "# 동인메뉴판 - 시스템 정보",
    "",
    `생성일: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    "",
    "## 환경 정보",
    "",
    "| 항목 | 값 |",
    "|------|-----|",
    `| 앱 버전 | ${app.getVersion()} |`,
    `| Electron | ${process.versions.electron} |`,
    `| Chrome | ${process.versions.chrome} |`,
    `| Node.js | ${process.versions.node} |`,
    `| 포터블 | ${process.env.PORTABLE_EXECUTABLE_DIR ? "예" : "아니요"} |`,
    `| 플랫폼 | ${os.platform()} |`,
    `| 아키텍처 | ${os.arch()} |`,
    `| OS 버전 | ${os.version()} |`,
    `| OS 릴리즈 | ${os.release()} |`,
    `| 로케일 | ${app.getLocale()} |`,
    "",
    "## 데이터",
    "",
    "| 항목 | 값 |",
    "|------|-----|",
    `| userData | ${app.getPath("userData")} |`,
    `| DB 파일 | ${dbPath} (${dbSize}) |`,
    `| 로그 파일 | ${logPath} (${existsSync(logPath) ? "있음" : "없음"}) |`,
    `| 책 수 | ${bookCount} |`,
    "",
  ].join("\n");
}

/** 디버그 데이터 ZIP을 savePath에 만든다 (내보내기·제보 첨부 공용) */
export async function writeDebugArchive(
  savePath: string,
  includeDb: boolean,
): Promise<void> {
  const systemInfo = await buildSystemInfo();
  const settings = buildSettingsDump(configStore.store);
  const logPath = getLogPath();
  const dbPath = getDbPath();
  if (includeDb) {
    // WAL에만 있는 변경분을 DB 파일로 옮겨야 복사본이 최신이다
    await db.raw("PRAGMA wal_checkpoint(TRUNCATE);");
  }

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(savePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);

    archive.append(systemInfo, { name: "system-info.md" });
    archive.append(settings, { name: "settings.json" });
    if (existsSync(logPath)) archive.file(logPath, { name: "main.log" });
    if (includeDb && existsSync(dbPath)) {
      archive.file(dbPath, { name: "database.db" });
    }
    archive.finalize();
  });
}

export const handleExportDebugData = async (
  event: IpcMainInvokeEvent,
  { includeDb }: { includeDb: boolean },
) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: "디버그 데이터 저장",
    defaultPath: buildDebugFilename(),
    filters: [{ name: "동인메뉴판 디버그 파일", extensions: ["dmd"] }],
  };
  const { canceled, filePath } = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    await writeDebugArchive(filePath, includeDb);
    return { success: true, path: filePath };
  } catch (error) {
    log.error("[DebugData] 내보내기 실패:", error);
    return { success: false, error: (error as Error).message };
  }
};

export function registerDebugDataHandlers() {
  ipcMain.handle("export-debug-data", (event, payload) =>
    handleExportDebugData(event, payload),
  );
}
