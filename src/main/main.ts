import {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  session,
  shell,
} from "electron";
import log from "electron-log";
import windowStateKeeper from "electron-window-state";
import { rmSync } from "fs";
import fs from "fs/promises";
import os from "os";
import PQueue from "p-queue";
import path from "path"; // path 모듈 전체 임포트
import db, { closeDbConnection } from "./db/index.js"; // db 모듈 추가
import "./handlers/bookHandler.js";
import { registerBookHandlers } from "./handlers/bookHandler.js";
import {
  store as configStore,
  registerConfigHandlers,
} from "./handlers/configHandler.js";
import {
  registerDirectoryHandlers,
  scanDirectory,
} from "./handlers/directoryHandler.js";
import { registerDownloaderHandlers } from "./handlers/downloaderHandler.js";
import {
  initializeDownloadQueue,
  registerDownloadQueueHandlers,
} from "./handlers/downloadQueueHandler.js";
import { registerEtcHandlers } from "./handlers/etcHandler.js";
import { registerPresetHandlers } from "./handlers/presetHandler.js";
import {
  registerSeriesCollectionHandlers,
  handleRunSeriesDetection,
  rebuildPrefixIndex,
  loadPrefixIndexFromData,
} from "./handlers/seriesCollectionHandler.js";
import { registerBrowseHandlers } from "./handlers/browseHandler.js";
import { registerStatisticsHandlers } from "./handlers/statisticsHandler.js";
import { registerDuplicatesHandlers } from "./handlers/duplicatesHandler.js";
import {
  handleGenerateThumbnail,
  registerThumbnailHandlers,
} from "./handlers/thumbnailHandler.js";
import { registerWindowHandlers } from "./handlers/windowHandler.js";
import {
  registerSubscriptionHandlers,
  startSubscriptionPollingIfEnabled,
} from "./handlers/subscriptionHandler.js";
import { registerUpdaterHandlers } from "./updater.js";
import { sendTo } from "./utils/broadcast.js";
import { openExternalIfAllowed } from "./utils/externalLink.js";
import { imageMimeType, sortImageFiles } from "./utils/imageFiles.js";
import { readZipPage } from "./utils/zipPages.js";

log.initialize();
export const console = log;

// [개발용] Chrome DevTools Protocol 포트 개방.
//
// 외부 디버깅 도구(chrome-devtools-mcp 등)가 --browserUrl로 이 포트에 붙어
// 렌더러를 검사합니다. app.whenReady() 이전에 걸어야 적용됩니다.
// 패키징된 앱에서는 절대 열지 않습니다.
if (process.env.NODE_ENV === "development") {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

// 앱이 중복으로 켜지지 않도록 방지
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

// 앱 사용 시간 추적을 위한 변수
let currentUsageLogId: number | null = null;

let mainWindow: BrowserWindow;
const viewerWindows = new Set<BrowserWindow>();

// 최초 부팅 시 시리즈 감지를 1회만 실행했는지 추적 (새로고침 시 재실행 방지)
let hasRunInitialSeriesDetection = false;

// 최초 부팅 시 라이브러리 자동 스캔을 1회만 실행했는지 추적 (새로고침 시 재실행 방지)
let hasRunInitialLibraryScan = false;
let hasStartedSubscriptionPolling = false;

/** 임시 썸네일 보관 기간. 이 기간이 지난 파일은 앱 시작 시 지웁니다 */
const TEMP_THUMBNAIL_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * 다운로더 임시 썸네일 중 오래된 것을 지웁니다.
 *
 * 설정 화면에 수동 삭제(`clear-temp-files`)가 있지만 그것만으로는 계속 쌓이기만
 * 합니다. 다운로더를 쓸수록 늘어나는 디렉터리라 자동 정리가 필요합니다.
 *
 * 앱 시작을 막지 않도록 await하지 않고 호출하며, 실패는 로그만 남깁니다.
 */
async function pruneTempThumbnails(dir: string) {
  try {
    const entries = await fs.readdir(dir);
    const threshold = Date.now() - TEMP_THUMBNAIL_MAX_AGE;
    let removed = 0;

    for (const entry of entries) {
      const filePath = path.join(dir, entry);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || stat.mtimeMs >= threshold) continue;
        await fs.unlink(filePath);
        removed++;
      } catch {
        // 개별 파일 실패는 무시합니다 (사용 중이거나 이미 지워진 경우)
      }
    }

    if (removed > 0) {
      log.info(`[Main] 오래된 임시 썸네일 ${removed}개 정리`);
    }
  } catch (error) {
    log.error("[Main] 임시 썸네일 정리 실패:", error);
  }
}

function createViewerWindow(fromUrl: string) {
  // 첫 창 생성 시 위치를 메인 창 기준으로 오프셋
  const mainBounds = mainWindow.getBounds();
  const offset = 20 * (viewerWindows.size + 1);
  const x = mainBounds.x + offset;
  const y = mainBounds.y + offset;

  const iconPath =
    process.env.NODE_ENV === "development"
      ? path.join(process.cwd(), "static", "icon.ico")
      : path.join(process.resourcesPath, "static", "icon.ico");

  const viewerWindow = new BrowserWindow({
    x,
    y,
    width: 800,
    height: 1000,
    icon: iconPath,
    titleBarStyle: "hidden",
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });
  viewerWindow.setMenu(null);

  if (process.env.NODE_ENV === "development") {
    const rendererPort = process.argv[2];
    viewerWindow.loadURL(`http://localhost:${rendererPort}/#${fromUrl}`);
  } else {
    viewerWindow.loadFile(
      path.join(import.meta.dirname, "..", "..", "renderer", "index.html"),
      { hash: fromUrl },
    );
  }

  viewerWindow.webContents.setWindowOpenHandler((details) => {
    openExternalIfAllowed(details.url);
    return { action: "deny" };
  });

  viewerWindows.add(viewerWindow);
  viewerWindow.on("closed", () => {
    viewerWindows.delete(viewerWindow);
  });
}

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 800,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    icon: process.resourcesPath
      ? path.join(process.resourcesPath, "static", "icon.ico")
      : undefined,
    titleBarStyle: "hidden",
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindowState.manage(mainWindow);

  if (process.env.NODE_ENV === "development") {
    const rendererPort = process.argv[2];
    // 개발자도구 먼저 열기
    mainWindow.webContents.openDevTools({ mode: "detach" });
    mainWindow.loadURL(`http://localhost:${rendererPort}`);
    // 개발 환경에서만 상태 저장 수동 (개발의 경우 정상 종료가 아니라 상태 저장이 안됨)
    const handleDevWindowStore = () => {
      mainWindowState.saveState(mainWindow);
    };
    mainWindow
      .addListener("move", handleDevWindowStore)
      .addListener("resize", handleDevWindowStore)
      .addListener("maximize", handleDevWindowStore)
      .addListener("unmaximize", handleDevWindowStore);
  } else {
    mainWindow.loadFile(
      path.join(import.meta.dirname, "..", "..", "renderer", "index.html"),
    );
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 허용된 도메인만 외부 브라우저로 열기
    openExternalIfAllowed(details.url);

    // Electron 내부 창 생성 차단
    return { action: "deny" };
  });

  // 창 상태 변경 시 Renderer에 알림
  mainWindow.on("maximize", () => {
    sendTo(mainWindow.webContents, "window-maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    sendTo(mainWindow.webContents, "window-maximized", false);
  });

  // Renderer가 로드된 후 시리즈 감지 실행 (UI 차단 방지)
  // 충분히 지연시켜 Vue 앱이 완전히 초기화된 후 실행
  // did-finish-load는 새로고침(Ctrl+R) 시에도 발생하므로, 최초 1회만 실행되도록 가드
  mainWindow.webContents.on("did-finish-load", () => {
    if (hasRunInitialSeriesDetection) return;
    hasRunInitialSeriesDetection = true;

    // 3초 후에 시리즈 감지 실행 (UI가 완전히 로드된 후)
    setTimeout(() => {
      const seriesSettings = configStore.get("seriesDetectionSettings", {
        minConfidence: 0.7,
        minBooks: 2,
      });

      handleRunSeriesDetection(seriesSettings)
        .then(async (result) => {
          if (result.success && result.data) {
            console.log(
              `[Main] 시리즈 감지 완료: ${result.data.created_count}개 시리즈 생성`,
            );
          }
          // 워커에서 전송한 인덱스 데이터로 복원 (DB 조회 없음)
          if (result.success && result.data?.indexEntries) {
            loadPrefixIndexFromData(result.data.indexEntries);
          } else {
            // 워커에서 인덱스 구축 실패 시 폴백으로 DB 조회
            await rebuildPrefixIndex();
            console.log("[Main] 접두사 인덱스 구축 완료 (폴백)");
          }
        })
        .catch((err) => {
          console.error("[Main] 시리즈 감지 실패:", err);
        });
    }, 3000);
  });
}

app.whenReady().then(async () => {
  // app.quit()은 비동기라 종료 전에 ready가 발화하면 창까지 만들어진다.
  if (!gotTheLock) {
    return;
  }

  createWindow();

  registerUpdaterHandlers(mainWindow);
  registerBookHandlers();
  registerConfigHandlers();
  registerDirectoryHandlers();
  registerDownloaderHandlers();
  registerDownloadQueueHandlers(mainWindow);
  registerEtcHandlers(mainWindow);
  registerPresetHandlers();
  registerSeriesCollectionHandlers();
  registerBrowseHandlers();
  registerStatisticsHandlers();
  registerDuplicatesHandlers();
  registerThumbnailHandlers();
  registerWindowHandlers(mainWindow, createViewerWindow, viewerWindows);
  registerSubscriptionHandlers(mainWindow);

  // 다운로드 큐 초기화 (미완료 다운로드 복구)
  await initializeDownloadQueue();

  // 앱 사용 시간 추적 시작
  try {
    const [logId] = await db("AppUsageLog").insert({
      started_at: new Date().toISOString(),
      ended_at: null,
      duration: null,
    });
    currentUsageLogId = logId;
  } catch (error) {
    console.error("[Main] 앱 사용 시간 추적 시작 실패:", error);
  }

  const tempThumbnailDir = path.join(
    app.getPath("userData"),
    "downloader_temp_thumbnails",
  );
  await fs.mkdir(tempThumbnailDir, { recursive: true });
  await fs.mkdir(path.join(app.getPath("userData"), "temp_cover"), {
    recursive: true,
  });

  // 오래된 임시 썸네일 정리. 설정의 수동 삭제만으로는 계속 쌓이기만 합니다.
  // 실패는 로그만 남기고 넘어갑니다 — 정리 때문에 앱 시작이 막히면 안 됩니다.
  void pruneTempThumbnails(tempThumbnailDir);

  // 커스텀 프로토콜 등록
  protocol.handle("doujin-menu", async (request) => {
    const url = new URL(request.url);
    const bookId = parseInt(url.hostname); // URL의 호스트 부분을 bookId로 사용
    const pageIndex = parseInt(url.pathname.substring(1)); // URL의 경로 부분을 페이지 인덱스로 사용 (선행 / 제거)

    if (isNaN(bookId) || isNaN(pageIndex)) {
      return new Response("Invalid URL", { status: 400 });
    }

    try {
      const book = await db("Book").where("id", bookId).first();

      if (!book || !book.path) {
        console.error(
          `[Main] Book not found or path missing for bookId: ${bookId}`,
        );
        return new Response("Book not found", { status: 404 });
      }

      const bookPath = book.path;

      // 폴더인 경우
      const isDirectory = await fs
        .stat(bookPath)
        .then((stat) => stat.isDirectory())
        .catch(() => false);

      if (isDirectory) {
        const imageFiles = sortImageFiles(await fs.readdir(bookPath));

        if (pageIndex >= 0 && pageIndex < imageFiles.length) {
          const imagePath = path.join(bookPath, imageFiles[pageIndex]);
          const imageBuffer = await fs.readFile(imagePath);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new Response(imageBuffer as any, {
            headers: { "Content-Type": imageMimeType(imagePath) },
          });
        } else {
          return new Response("Page not found", { status: 404 });
        }
      } else if (/\.(cbz|zip)$/i.exec(bookPath)) {
        const page = await readZipPage(bookPath, pageIndex);

        if (!page) {
          return new Response("Page not found in zip", { status: 404 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response(page.buffer as any, {
          headers: { "Content-Type": imageMimeType(page.fileName) },
        });
      } else {
        return new Response("Unsupported book format", { status: 400 });
      }
    } catch (error) {
      console.error(
        `[Main] Error handling doujin-menu protocol request:`,
        error,
      );
      return new Response("Internal server error", { status: 500 });
    }
  });

  // 앱 종료 시 외부 프로그램 임시 파일 정리
  app.on("before-quit", () => {
    const tempExternalDir = path.join(app.getPath("userData"), "temp_external");
    try {
      rmSync(tempExternalDir, { recursive: true, force: true });
    } catch {
      // 폴더가 없으면 무시
    }
  });

  // 현재 창 최대화 상태 요청 핸들러
  ipcMain.handle("get-window-maximized-state", () => {
    return mainWindow?.isMaximized() || false;
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": ["script-src 'self'"],
      },
    });
  });

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // 두 번째 인스턴스가 실행될 때 기존 창을 활성화
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle("get-initial-lock-status", () => {
    const useLock = configStore.get("useAppLock");
    const passwordSet = !!configStore.get("appLockPassword");
    return useLock && passwordSet;
  });

  ipcMain.handle("open-folder", async (_event, folderPath: string) => {
    try {
      const result = await shell.openPath(folderPath);
      if (result) {
        console.error(`Failed to open folder: ${result}`);
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error opening folder ${folderPath}:`, error);
      return { success: false, error: message };
    }
  });

  // 앱 시작 시 라이브러리 자동 스캔 (비동기로 실행하여 UI 로딩 차단 방지)
  const config = configStore.store;
  if (config.autoLoadLibrary) {
    const libraryFolders = config.libraryFolders || [];

    // 렌더러가 진행 배너 리스너를 등록한 뒤 스캔을 시작한다.
    // 증분 스캔(②)으로 스캔이 매우 빨라 렌더러 준비 전에 끝나면 배너 이벤트를
    // 놓치므로, renderer-ready 신호를 받은 시점부터 스캔을 돌린다.
    ipcMain.on("renderer-ready", () => {
      // 새로고침(Ctrl+R) 시 renderer-ready가 재전송되어도 최초 1회만 스캔하도록 가드
      if (hasRunInitialLibraryScan) return;
      hasRunInitialLibraryScan = true;

      // 스캔을 백그라운드에서 비동기로 실행 (UI 로딩을 차단하지 않음)
      Promise.resolve().then(async () => {
        for (const folderPath of libraryFolders) {
          console.log(`[Main] Auto-scanning library folder: ${folderPath}`);
          await scanDirectory(folderPath);

          const books = await db("Book")
            .select("id")
            .whereLike("path", `${folderPath}%`)
            .and.where("cover_path", null);

          // 썸네일 앞단(ZIP 열기·커버 추출)에는 워커 풀 같은 제한이 없다.
          const thumbnailQueue = new PQueue({
            concurrency: os.cpus().length,
          });
          await thumbnailQueue.addAll(
            books.map((book) => () => handleGenerateThumbnail(book.id)),
          );
        }

        // 스캔 완료 후 UI에 알림
        sendTo(mainWindow.webContents, "library-scan-completed");
      });
    });
  }

  // 구독 신작 확인 시작.
  // renderer-ready를 쓰는 이유는 시간이 아니라 렌더러 생존 보장이다 —
  // 리스너 등록 전에 broadcast하면 첫 토스트가 그냥 사라진다.
  // 초기 로딩(테마 CSS, 설정 왕복, 자동 스캔)과 겹치지 않게 10초 늦춘다.
  ipcMain.on("renderer-ready", () => {
    // Ctrl+R로 renderer-ready가 재전송돼도 최초 1회만 건다
    if (hasStartedSubscriptionPolling) return;
    hasStartedSubscriptionPolling = true;

    setTimeout(() => {
      startSubscriptionPollingIfEnabled();
    }, 10_000);
  });
});

app.on("window-all-closed", async function () {
  // 앱 사용 시간 추적 종료
  if (currentUsageLogId !== null) {
    try {
      const endedAt = new Date();
      const log = await db("AppUsageLog")
        .where("id", currentUsageLogId)
        .first();

      if (log?.started_at) {
        const startedAt = new Date(log.started_at);
        const durationSeconds = Math.floor(
          (endedAt.getTime() - startedAt.getTime()) / 1000,
        );

        await db("AppUsageLog").where("id", currentUsageLogId).update({
          ended_at: endedAt.toISOString(),
          duration: durationSeconds,
        });

        console.log(
          `[Main] 앱 사용 시간 추적 종료 (사용 시간: ${durationSeconds}초)`,
        );
      }
    } catch (error) {
      console.error("[Main] 앱 사용 시간 추적 종료 실패:", error);
    }
  }

  await closeDbConnection();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
