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
import fs from "fs/promises";
import path from "path"; // path 모듈 전체 임포트
import * as yauzl from "yauzl";
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
import { registerEtcHandlers } from "./handlers/etcHandler.js";
import { registerPresetHandlers } from "./handlers/presetHandler.js";
import { registerStatisticsHandlers } from "./handlers/statisticsHandler.js";
import { registerThumbnailHandlers } from "./handlers/thumbnailHandler.js";
import { registerUpdaterHandlers } from "./updater.js";
import { naturalSort } from "./utils/index.js";

log.initialize();
export const console = log;

// 앱이 중복으로 켜지지 않도록 방지
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow;

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
    icon: path.join(process.resourcesPath, "static", "icon.ico"),
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
    mainWindow.loadURL(`http://localhost:${rendererPort}`).then(() => {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    });
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
      path.join(import.meta.dirname, "..", "renderer", "index.html"),
    );
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 특정 도메인만 외부 브라우저로 열기
    const allowedDomains = ["github.com", "www.dlsite.com", "forms.gle"];
    if (
      allowedDomains.some((domain) =>
        details.url.startsWith("https://" + domain),
      )
    ) {
      shell.openExternal(details.url);
    }

    // Electron 내부 창 생성 차단
    return { action: "deny" };
  });

  // 창 상태 변경 시 Renderer에 알림
  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window-maximized", false);
  });
}

app.whenReady().then(async () => {
  createWindow();
  registerUpdaterHandlers(mainWindow);
  registerBookHandlers();
  registerConfigHandlers();
  registerDirectoryHandlers();
  registerDownloaderHandlers();
  registerEtcHandlers(mainWindow);
  registerPresetHandlers();
  registerStatisticsHandlers();
  registerThumbnailHandlers();

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
        const files = await fs.readdir(bookPath);
        const imageFiles = files
          .filter((file) => file.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i))
          .sort(naturalSort);

        if (pageIndex >= 0 && pageIndex < imageFiles.length) {
          const imagePath = path.join(bookPath, imageFiles[pageIndex]);
          const imageBuffer = await fs.readFile(imagePath);
          const mimeType = `image/${path.extname(imagePath).substring(1)}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new Response(imageBuffer as any, {
            headers: { "Content-Type": mimeType },
          });
        } else {
          return new Response("Page not found", { status: 404 });
        }
      } else if (bookPath.toLowerCase().endsWith(".zip")) {
        // ZIP 파일인 경우
        return new Promise((resolve, reject) => {
          yauzl.open(
            bookPath,
            { lazyEntries: true, autoClose: false },
            (err, zipfile) => {
              if (err) {
                console.error(
                  `[Main] Error opening zip file ${bookPath}:`,
                  err,
                );
                return reject(
                  new Response("Failed to open zip file", { status: 500 }),
                );
              }

              const imageEntries: { fileName: string; entry: yauzl.Entry }[] =
                [];
              zipfile.on("entry", (entry) => {
                if (!entry.fileName.endsWith("/")) {
                  // 폴더 엔트리 무시
                  const ext = path.extname(entry.fileName).toLowerCase();
                  if (
                    [`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`].includes(
                      ext,
                    )
                  ) {
                    imageEntries.push({ fileName: entry.fileName, entry });
                  }
                }
                zipfile.readEntry();
              });

              zipfile.on("end", () => {
                imageEntries.sort((a, b) =>
                  naturalSort(a.fileName, b.fileName),
                ); // 파일명으로 정렬

                if (pageIndex >= 0 && pageIndex < imageEntries.length) {
                  const targetEntry = imageEntries[pageIndex].entry;
                  zipfile.openReadStream(targetEntry, (err, readStream) => {
                    if (err) {
                      console.error(
                        `[Main] Error opening read stream for ${targetEntry.fileName}:`,
                        err,
                      );
                      zipfile.close(); // Ensure zipfile is closed on error
                      return reject(
                        new Response("Failed to read image from zip", {
                          status: 500,
                        }),
                      );
                    }

                    const chunks: Buffer[] = [];
                    readStream.on("data", (chunk) => chunks.push(chunk));
                    readStream.on("end", () => {
                      zipfile.close(); // Ensure zipfile is closed after stream ends
                      const buffer = Buffer.concat(chunks);
                      const mimeType = `image/${path.extname(targetEntry.fileName).substring(1)}`;
                      resolve(
                        new Response(buffer, {
                          headers: { "Content-Type": mimeType },
                        }),
                      );
                    });
                    readStream.on("error", (streamErr) => {
                      console.error(
                        `[Main] Read stream error for ${targetEntry.fileName}:`,
                        streamErr,
                      );
                      zipfile.close(); // Ensure zipfile is closed on stream error
                      reject(
                        new Response("Error reading image stream", {
                          status: 500,
                        }),
                      );
                    });
                  });
                } else {
                  zipfile.close();
                  resolve(
                    new Response("Page not found in zip", { status: 404 }),
                  );
                }
              });

              zipfile.on("error", (zipErr) => {
                console.error(`[Main] Zip file error for ${bookPath}:`, zipErr);
                zipfile.close();
                reject(new Response("Error reading zip file", { status: 500 }));
              });

              zipfile.readEntry(); // 첫 번째 엔트리 읽기 시작
            },
          );
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

  // 창 제어 IPC 핸들러
  ipcMain.on("minimize-window", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("maximize-toggle-window", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("close-window", () => {
    mainWindow?.close();
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

  // 앱 시작 시 라이브러리 자동 스캔
  const config = configStore.store; // configStore에서 현재 설정 가져오기
  if (config.autoLoadLibrary) {
    const libraryFolders = config.libraryFolders || [];
    for (const folderPath of libraryFolders) {
      console.log(`[Main] Auto-scanning library folder: ${folderPath}`);
      await scanDirectory(folderPath);
    }
  }
});

app.on("window-all-closed", async function () {
  await closeDbConnection();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
