import { app, BrowserWindow, dialog, ipcMain } from "electron";
import Store from "electron-store";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { closeDbConnection } from "../db/index.js";
import { scanDirectory } from "./directoryHandler.js";

// 설정 파일의 타입을 정의합니다.
interface Config {
  theme?: "light" | "dark" | "auto";
  autoLoadLibrary?: boolean;
  libraryFolders?: string[];
  viewerReadingDirection?: "ltr" | "rtl" | "webtoon";
  viewerDoublePageView?: boolean;
  viewerAutoFitZoom?: boolean;
  viewerRestoreLastSession?: boolean;
  downloadPath?: string;
  downloaderLanguage?: string;
  downloadPattern?: string;
  createInfoTxtFile?: boolean; // New setting
}

const defaults: Config = {
  theme: "auto",
  autoLoadLibrary: true,
  libraryFolders: [],
  viewerReadingDirection: "rtl",
  viewerDoublePageView: true,
  viewerAutoFitZoom: true,
  viewerRestoreLastSession: true,
  downloadPath: "",
  downloaderLanguage: "all",
  downloadPattern: "%artist% - %title%",
  createInfoTxtFile: true, // Default value for createInfoTxtFile
};

export const store = new Store<Config>({
  defaults,
});

const isDevelopment = process.env.NODE_ENV === "development";
const getDbPath = () => {
  if (isDevelopment) {
    return path.resolve(process.cwd(), "dev.sqlite3");
  } else {
    return path.join(app.getPath("userData"), "database.db");
  }
};

export const handleGetConfig = async () => {
  return store.store;
};

export const handleGetConfigValue = async (key: keyof Config) => {
  return store.get(key);
};

export const handleSetConfig = async <T extends keyof Config>({
  key,
  value,
}: {
  key: T;
  value: Config[T];
}) => {
  try {
    store.set(key, value);
    return { success: true };
  } catch (error) {
    console.error(
      `[ConfigHandler] Failed to set config for key "${key}":`,
      error,
    );
    return { success: false, error: (error as Error).message };
  }
};

export const handleRescanAllMetadata = async () => {
  try {
    const libraryFolders = store.get("libraryFolders", []);
    for (const folderPath of libraryFolders) {
      await scanDirectory(folderPath);
    }
    return { success: true };
  } catch (error) {
    console.error(`[ConfigHandler] Failed to rescan all metadata:`, error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleAddLibraryFolder = async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: "라이브러리 폴더 선택",
    properties: ["openDirectory", "multiSelections"],
  });

  if (!filePaths || filePaths.length === 0) {
    return { success: false, error: "No folder selected." };
  }

  const currentFolders = store.get("libraryFolders", []);
  const addedFolders: string[] = [];
  const alreadyExistsFolders: string[] = [];

  for (const folderPath of filePaths) {
    if (!currentFolders.includes(folderPath)) {
      currentFolders.push(folderPath);
      addedFolders.push(folderPath);
    } else {
      alreadyExistsFolders.push(folderPath);
    }
  }

  store.set("libraryFolders", currentFolders);

  if (addedFolders.length > 0) {
    return {
      success: true,
      folders: currentFolders,
      added: addedFolders,
      alreadyExists: alreadyExistsFolders,
    };
  } else {
    return {
      success: false,
      error: "All selected folders already exist.",
      alreadyExists: alreadyExistsFolders,
    };
  }
};

export const handleRemoveLibraryFolder = async (folderPath: string) => {
  const currentFolders = store.get("libraryFolders", []);
  const newFolders = currentFolders.filter((p) => p !== folderPath);
  store.set("libraryFolders", newFolders);
  return { success: true, folders: newFolders };
};

export const handleBackupDatabase = async (
  event: Electron.IpcMainInvokeEvent,
) => {
  const webContents = event.sender;
  const { filePaths } = await dialog.showOpenDialog(
    BrowserWindow.fromWebContents(webContents)!,
    {
      title: "백업 저장 폴더 선택",
      properties: ["openDirectory", "createDirectory"],
    },
  );

  if (!filePaths || filePaths.length === 0) {
    return { success: false, error: "No backup location selected." };
  }

  const backupDir = filePaths[0];
  try {
    const dbPath = getDbPath();
    const dbFileName = isDevelopment ? "dev.sqlite3" : "database.db";
    const backupDbPath = path.join(backupDir, dbFileName);
    await fs.copyFile(dbPath, backupDbPath);

    const configPath = path.join(app.getPath("userData"), "config.json");
    const backupConfigPath = path.join(backupDir, "config.json");
    if (existsSync(configPath)) {
      await fs.copyFile(configPath, backupConfigPath);
    }

    return { success: true };
  } catch (error) {
    console.error("[ConfigHandler] Failed to backup data:", error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleRestoreDatabase = async (
  event: Electron.IpcMainInvokeEvent,
) => {
  const webContents = event.sender;
  const { filePaths } = await dialog.showOpenDialog(
    BrowserWindow.fromWebContents(webContents)!,
    {
      title: "복원할 백업 폴더 선택",
      properties: ["openDirectory"],
    },
  );

  if (!filePaths || filePaths.length === 0) {
    return { success: false, error: "No backup folder selected." };
  }

  const backupDir = filePaths[0];
  try {
    const dbPath = getDbPath();
    const dbFileName = isDevelopment ? "dev.sqlite3" : "database.db";
    const backupDbPath = path.join(backupDir, dbFileName);

    if (!existsSync(backupDbPath)) {
      return {
        success: false,
        error: `Backup database file not found: ${backupDbPath}`,
      };
    }

    // 0. 데이터베이스 연결 종료 (복원 전에)
    await closeDbConnection();

    // 1. 데이터베이스 파일 복사
    await fs.copyFile(backupDbPath, dbPath);

    // 2. electron-store 설정 파일 복사
    const configPath = path.join(app.getPath("userData"), "config.json");
    const backupConfigPath = path.join(backupDir, "config.json");
    if (existsSync(backupConfigPath)) {
      await fs.copyFile(backupConfigPath, configPath);
    }

    // 앱 재시작 (데이터베이스 및 설정 변경 사항 적용)
    app.relaunch();
    setTimeout(() => {
      app.quit();
    }, 100); // 100ms 지연 후 종료
    return { success: true };
  } catch (error) {
    console.error("[ConfigHandler] Failed to restore data:", error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleResetAllData = async () => {
  try {
    // 0. 데이터베이스 연결 종료
    await closeDbConnection();

    // 1. 데이터베이스 파일 삭제
    const dbPath = getDbPath();
    if (existsSync(dbPath)) {
      await fs.unlink(dbPath);
    }

    // 2. electron-store 설정 파일 삭제
    const configPath = path.join(app.getPath("userData"), "config.json");
    if (existsSync(configPath)) {
      await fs.unlink(configPath);
    }

    // 3. 썸네일 캐시 폴더 삭제
    const thumbnailDir = path.join(app.getPath("userData"), "thumbnails");
    if (existsSync(thumbnailDir)) {
      await fs.rm(thumbnailDir, { recursive: true, force: true });
    }

    // 4. 앱 재시작
    app.relaunch();
    setTimeout(() => {
      app.quit();
    }, 100); // 100ms 지연 후 종료

    return { success: true };
  } catch (error) {
    console.error("[ConfigHandler] Failed to reset all data:", error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * 설정 관련 IPC 통신 핸들러를 등록합니다.
 */
export function registerConfigHandlers() {
  // 전체 설정 불러오기
  ipcMain.handle("get-config", (_event) => handleGetConfig());
  // 특정 설정 값 불러오기
  ipcMain.handle("get-config-value", (_event, key) =>
    handleGetConfigValue(key),
  );
  // 설정 저장하기
  ipcMain.handle("set-config", (_event, params) => handleSetConfig(params));
  // 전체 메타데이터 재스캔
  ipcMain.handle("rescan-all-metadata", (_event) => handleRescanAllMetadata());
  // 라이브러리 폴더 추가
  ipcMain.handle("add-library-folder", (_event) => handleAddLibraryFolder());
  // 라이브러리 폴더 삭제
  ipcMain.handle("remove-library-folder", (_event, folderPath) =>
    handleRemoveLibraryFolder(folderPath),
  );
  // 데이터베이스 백업
  ipcMain.handle("backup-database", (event) => handleBackupDatabase(event));
  // 데이터베이스 복원
  ipcMain.handle("restore-database", (event) => handleRestoreDatabase(event));
  // 모든 데이터 초기화
  ipcMain.handle("reset-all-data", (_event) => handleResetAllData());
}
