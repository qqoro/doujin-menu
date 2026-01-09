import crypto from "crypto";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import Store from "electron-store";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import db, { closeDbConnection } from "../db/index.js";
import { scanDirectory } from "./directoryHandler.js";
import { handleGenerateThumbnail } from "./thumbnailHandler.js";

// 라이브러리 뷰 설정 타입
interface LibraryViewSettings {
  sortBy: string;
  sortOrder: "asc" | "desc";
  readStatus: "all" | "read" | "unread";
  viewMode: "grid" | "list";
}

// 시리즈 감지 설정 타입
interface SeriesDetectionSettings {
  minConfidence: number;
  minBooks: number;
}

// 설정 파일의 타입을 정의합니다.
interface Config {
  theme?: "light" | "dark" | "auto";
  colorTheme?: string; // 모든 tweakcn 테마 지원
  autoLoadLibrary?: boolean;
  libraryFolders?: string[];
  viewerReadingDirection?: "ltr" | "rtl" | "webtoon";
  viewerDoublePageView?: boolean;
  viewerAutoFitZoom?: boolean;
  viewerRestoreLastSession?: boolean;
  downloadPath?: string;
  downloaderLanguage?: string;
  downloadPattern?: string;
  createInfoTxtFile?: boolean;
  compressDownload?: boolean;
  compressFormat?: "cbz" | "zip";
  libraryViewSettings?: LibraryViewSettings;
  seriesDetectionSettings?: SeriesDetectionSettings;
  prioritizeKoreanTitles?: boolean;
  hideLibraryTags?: boolean;
  useAppLock?: boolean;
  appLockPassword?: string; // salt:hash
  viewerExcludeCompleted?: boolean;
}

const defaults: Config = {
  theme: "auto",
  colorTheme: "cosmic-night",
  autoLoadLibrary: true,
  libraryFolders: [],
  viewerReadingDirection: "rtl",
  viewerDoublePageView: true,
  viewerAutoFitZoom: true,
  viewerRestoreLastSession: true,
  viewerExcludeCompleted: false,
  downloadPath: "",
  downloaderLanguage: "all",
  downloadPattern: "%artist% - %title%",
  createInfoTxtFile: true,
  compressDownload: false,
  compressFormat: "cbz",
  libraryViewSettings: {
    sortBy: "added_at",
    sortOrder: "desc",
    readStatus: "all",
    viewMode: "grid",
  },
  seriesDetectionSettings: {
    minConfidence: 0.7,
    minBooks: 2,
  },
  prioritizeKoreanTitles: false,
  hideLibraryTags: false,
  useAppLock: false,
  appLockPassword: "",
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

export const handleSetLockPassword = async (password: string) => {
  try {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, "sha512")
      .toString("hex");
    store.set("appLockPassword", `${salt}:${hash}`);
    return { success: true };
  } catch (error) {
    console.error(`[ConfigHandler] Failed to set lock password:`, error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleClearLockPassword = async () => {
  try {
    store.delete("appLockPassword");
    return { success: true };
  } catch (error) {
    console.error(`[ConfigHandler] Failed to clear lock password:`, error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleVerifyLockPassword = async (password: string) => {
  try {
    const storedPassword = store.get("appLockPassword");
    if (!storedPassword) {
      return { success: false, error: "Password not set." };
    }

    const [salt, hash] = storedPassword.split(":");
    const verifyHash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, "sha512")
      .toString("hex");

    if (verifyHash === hash) {
      return { success: true };
    } else {
      return { success: false, error: "Invalid password." };
    }
  } catch (error) {
    console.error(`[ConfigHandler] Failed to verify lock password:`, error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleRescanAllMetadata = async () => {
  try {
    const libraryFolders = store.get("libraryFolders", []);
    for (const folderPath of libraryFolders) {
      await scanDirectory(folderPath);
      const books = await db("Book")
        .select("id")
        .whereLike("path", `${folderPath}%`)
        .and.where("cover_path", null);
      await Promise.all(books.map((book) => handleGenerateThumbnail(book.id)));
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

async function deleteBooksInFolder(folderPath: string) {
  console.log(
    `[ConfigHandler] Deleting books associated with folder: ${folderPath}`,
  );
  await db.transaction(async (trx) => {
    const booksToDelete = await trx("Book")
      .select("id", "path", "cover_path")
      .where("path", "like", `${folderPath}%`);

    for (const book of booksToDelete) {
      console.log(`[ConfigHandler] Deleting book from DB: ${book.path}`);
      await trx("BookArtist").where("book_id", book.id).del();
      await trx("BookTag").where("book_id", book.id).del();
      await trx("BookSeries").where("book_id", book.id).del();
      await trx("BookGroup").where("book_id", book.id).del();
      await trx("BookCharacter").where("book_id", book.id).del();
      await trx("BookHistory").where("book_id", book.id).del();
      await trx("Book").where("id", book.id).del();

      if (book.cover_path) {
        try {
          await fs.unlink(book.cover_path);
          console.log(
            `[ConfigHandler] Deleted thumbnail file: ${book.cover_path}`,
          );
        } catch (e) {
          console.error(
            `[ConfigHandler] Failed to delete thumbnail file ${book.cover_path}:`,
            e,
          );
        }
      }
    }
  });
  console.log(
    `[ConfigHandler] Finished deleting books for folder: ${folderPath}`,
  );
}

export const handleRemoveLibraryFolder = async (folderPath: string) => {
  const currentFolders = store.get("libraryFolders", []);
  const newFolders = currentFolders.filter((p) => p !== folderPath);

  try {
    await deleteBooksInFolder(folderPath); // 분리된 함수 호출
    store.set("libraryFolders", newFolders);
    console.log(
      `[ConfigHandler] Successfully removed library folder ${folderPath} and associated books.`,
    );
    return { success: true, folders: newFolders };
  } catch (error) {
    console.error(
      `[ConfigHandler] Failed to remove library folder ${folderPath} or associated books:`,
      error,
    );
    return { success: false, error: (error as Error).message };
  }
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
    // wal 파일 커밋
    await db.raw(`PRAGMA wal_checkpoint(TRUNCATE);`);

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
  // 비밀번호 설정
  ipcMain.handle("set-lock-password", (_event, password) =>
    handleSetLockPassword(password),
  );
  // 비밀번호 초기화
  ipcMain.handle("clear-lock-password", (_event) => handleClearLockPassword());
  // 비밀번호 검증
  ipcMain.handle("verify-lock-password", (_event, password) =>
    handleVerifyLockPassword(password),
  );
}
