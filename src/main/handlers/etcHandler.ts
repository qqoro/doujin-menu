import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain, shell } from "electron";
import fg from "fast-glob";
import { spawn } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import db from "../db/index.js";
import { hitomi } from "../services/hitomi/client.js";
import { buildInfoContent } from "../services/hitomi/gallery.js";
import { sendTo } from "../utils/broadcast.js";
import { openExternalIfAllowed } from "../utils/externalLink.js";
import { sortImageFiles } from "../utils/imageFiles.js";
import { getZipPageNames, readZipPage } from "../utils/zipPages.js";
import { console } from "../main.js";
import { store as configStore } from "./configHandler.js";

export async function getDirSize(dirPath: string): Promise<number> {
  try {
    const stats = await fs.lstat(dirPath).catch(() => null);
    if (!stats) {
      return 0;
    }
    if (!stats.isDirectory()) {
      return stats.size;
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        return getDirSize(fullPath);
      }),
    );

    return sizes.reduce((acc, size) => acc + size, 0);
  } catch (error) {
    console.error(`Error calculating size for ${dirPath}:`, error);
    return 0;
  }
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) {
    return "0 Bytes";
  }
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(dm)} ${sizes[i]}`;
}

async function handleGenerateMissingInfoFiles(
  event: IpcMainInvokeEvent,
  pattern: string,
) {
  const libraryFolders = configStore.get("libraryFolders", []);
  if (!libraryFolders.length) {
    return {
      success: true,
      data: { createdCount: 0, skippedCount: 0, errorCount: 0 },
      message: "라이브러리 폴더가 설정되지 않았습니다.",
    };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (e) {
    return {
      success: false,
      message: `잘못된 정규식입니다: ${(e as Error).message}`,
      data: { createdCount: 0, skippedCount: 0, errorCount: 0 },
    };
  }

  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  // 1. fast-glob로 모든 하위 폴더 찾기 (중첩 폴더 포함)
  const allFolders: string[] = [];
  for (const folderPath of libraryFolders) {
    try {
      const folders = await fg(["**/*"], {
        cwd: folderPath,
        absolute: true,
        onlyDirectories: true,
        deep: 100,
      });
      allFolders.push(...folders);
    } catch (error) {
      console.error(
        `Error scanning library folder ${folderPath} with fast-glob:`,
        error,
      );
    }
  }

  const totalFolders = allFolders.length;

  sendTo(event.sender, "info-generation-progress", {
    total: totalFolders,
    current: 0,
    message: "작업을 시작합니다...",
  });

  // 2. 각 폴더에 대해 info.txt 생성
  for (const subfolderPath of allFolders) {
    processedCount++;
    const folderName = path.basename(subfolderPath);
    const infoFilePath = path.join(subfolderPath, "info.txt");
    let statusMessage: string;

    try {
      await fs.access(infoFilePath);
      statusMessage = `건너뜀 (파일 있음): ${folderName}`;
      skippedCount++;
    } catch {
      // info.txt가 없는 경우
      const match = RegExp(regex).exec(folderName);
      if (match?.[1]) {
        const galleryId = parseInt(match[1], 10);
        try {
          const gallery = await hitomi.galleries.retrieve(galleryId);

          await fs.writeFile(infoFilePath, buildInfoContent(gallery));
          statusMessage = `생성 완료: ${folderName}`;
          createdCount++;
        } catch (error) {
          console.error(
            `Error fetching gallery info for ID ${galleryId}`,
            error,
          );
          statusMessage = `오류 (정보 조회 실패): ${folderName}`;
          errorCount++;
        }
      } else {
        statusMessage = `건너뜀 (패턴 불일치): ${folderName}`;
        skippedCount++;
      }
    }

    sendTo(event.sender, "info-generation-progress", {
      total: totalFolders,
      current: processedCount,
      message: statusMessage,
    });
  }

  const finalMessage = `작업 완료: ${createdCount}개 생성, ${skippedCount}개 건너뜀, ${errorCount}개 오류`;
  sendTo(event.sender, "info-generation-progress", {
    total: totalFolders,
    current: totalFolders,
    message: finalMessage,
  });

  return {
    success: true,
    data: { createdCount, skippedCount, errorCount },
    message: finalMessage,
  };
}

/**
 * '기타' 기능 관련 IPC 핸들러를 등록합니다.
 * @param win Electron BrowserWindow 인스턴스
 */
export function registerEtcHandlers(win: BrowserWindow) {
  // 앱 버전 반환
  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  // 개발자 도구 토글
  ipcMain.on("toggle-dev-tools", () => {
    win.webContents.toggleDevTools();
  });

  // 외부 링크 열기
  ipcMain.on("open-external-link", (_event, url: string) => {
    if (!openExternalIfAllowed(url)) {
      console.warn(`[EtcHandler] 허용되지 않은 외부 링크 차단: ${url}`);
    }
  });

  // 로그 폴더 열기
  ipcMain.on("open-log-folder", () => {
    const logPath = app.getPath("logs");
    shell.openPath(logPath);
  });

  // 탐색기에서 폴더 열기
  ipcMain.handle(
    "open-folder-in-explorer",
    async (_event, folderPath: string) => {
      try {
        await shell.openPath(folderPath);
        return { success: true };
      } catch (error) {
        console.error(`Failed to open folder ${folderPath}:`, error);
        return { success: false, error: (error as Error).message };
      }
    },
  );

  ipcMain.handle("get-temp-files-size", async () => {
    try {
      const tempPath = [
        path.join(app.getPath("userData"), "downloader_temp_thumbnails"),
        path.join(app.getPath("userData"), "temp_cover"),
        path.join(app.getPath("userData"), "temp_external"),
      ];
      const totalSize = (
        await Promise.all(tempPath.map((path) => getDirSize(path)))
      ).reduce((p, c) => p + c, 0);
      return { success: true, data: formatBytes(totalSize) };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("clear-temp-files", async () => {
    try {
      const tempPath = [
        path.join(app.getPath("userData"), "downloader_temp_thumbnails"),
        path.join(app.getPath("userData"), "temp_cover"),
        path.join(app.getPath("userData"), "temp_external"),
      ];

      for (const temp of tempPath) {
        // temp_external은 앱 종료 시 폴더째 지워진다. 없는 게 정상.
        const list = await fs.readdir(temp).catch(() => [] as string[]);
        await Promise.allSettled(
          list.map(async (file) => {
            await fs.rm(path.join(temp, file), {
              force: true,
              recursive: true,
            });
          }),
        );
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("generate-missing-info-files", (event, pattern: string) =>
    handleGenerateMissingInfoFiles(event, pattern),
  );

  ipcMain.handle(
    "open-with-external-program",
    async (
      _event,
      { bookId, pageIndex }: { bookId: number; pageIndex: number },
    ) => {
      try {
        // 설정에서 프로그램 경로 가져오기
        const programPath = configStore.get("externalImageViewerPath", "");
        if (!programPath) {
          return {
            success: false,
            error: "외부 프로그램이 설정되지 않았습니다.",
          };
        }
        if (!existsSync(programPath)) {
          return { success: false, error: "프로그램을 찾을 수 없습니다." };
        }

        // 책 정보 조회
        const book = await db("Book").where("id", bookId).first();
        if (!book || !book.path) {
          return { success: false, error: "책을 찾을 수 없습니다." };
        }

        const bookPath = book.path;
        let imagePath: string;

        // 폴더 형식인 경우
        const isDirectory = await fs
          .stat(bookPath)
          .then((stat) => stat.isDirectory())
          .catch(() => false);

        if (isDirectory) {
          const imageFiles = sortImageFiles(await fs.readdir(bookPath));

          if (pageIndex < 0 || pageIndex >= imageFiles.length) {
            return { success: false, error: "페이지를 찾을 수 없습니다." };
          }
          imagePath = path.join(bookPath, imageFiles[pageIndex]);
        } else if (/\.(cbz|zip)$/i.exec(bookPath)) {
          // ZIP/CBZ 형식인 경우: 임시 파일로 추출
          imagePath = await extractPageFromZip(bookPath, bookId, pageIndex);
        } else {
          return { success: false, error: "지원하지 않는 형식입니다." };
        }

        // 외부 프로그램 실행 (fire-and-forget)
        const child = spawn(programPath, [imagePath], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();

        return { success: true };
      } catch (error) {
        console.error("[EtcHandler] 외부 프로그램 실행 실패:", error);
        return { success: false, error: (error as Error).message };
      }
    },
  );

  ipcMain.handle(
    "open-book-with-external-viewer",
    async (_event, { bookId }: { bookId: number }) => {
      try {
        const book = await db("Book").where("id", bookId).first();
        if (!book || !book.path) {
          return { success: false, error: "책을 찾을 수 없습니다." };
        }

        const bookPath = book.path;
        const isDirectory = await fs
          .stat(bookPath)
          .then((stat) => stat.isDirectory())
          .catch(() => false);
        const isArchive = /\.(cbz|zip)$/i.test(bookPath);

        let programPath: string;
        let targetPath: string;

        if (isArchive) {
          // 압축 파일인 경우 압축파일 뷰어로 실행
          programPath = configStore.get("externalArchiveViewerPath", "");
          if (!programPath) {
            return {
              success: false,
              error: "압축파일 뷰어가 설정되지 않았습니다.",
            };
          }
          targetPath = bookPath;
        } else if (isDirectory) {
          // 폴더인 경우 이미지 뷰어로 첫 번째 이미지 파일 실행
          programPath = configStore.get("externalImageViewerPath", "");
          if (!programPath) {
            return {
              success: false,
              error: "이미지 뷰어가 설정되지 않았습니다.",
            };
          }
          const imageFiles = sortImageFiles(await fs.readdir(bookPath));
          if (imageFiles.length === 0) {
            return { success: false, error: "이미지 파일을 찾을 수 없습니다." };
          }
          targetPath = path.join(bookPath, imageFiles[0]);
        } else {
          return { success: false, error: "지원하지 않는 형식입니다." };
        }

        if (!existsSync(programPath)) {
          return { success: false, error: "프로그램을 찾을 수 없습니다." };
        }

        // 외부 뷰어 실행 (fire-and-forget)
        const child = spawn(programPath, [targetPath], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();

        return { success: true };
      } catch (error) {
        console.error("[EtcHandler] 외부 프로그램 실행 실패:", error);
        return { success: false, error: (error as Error).message };
      }
    },
  );
}

/** ZIP/CBZ에서 특정 페이지를 임시 파일로 추출 */
async function extractPageFromZip(
  zipPath: string,
  bookId: number,
  pageIndex: number,
): Promise<string> {
  const fileNames = await getZipPageNames(zipPath);

  if (pageIndex < 0 || pageIndex >= fileNames.length) {
    throw new Error("페이지를 찾을 수 없습니다.");
  }

  const ext = path.extname(fileNames[pageIndex]).toLowerCase();
  const tempDir = path.join(app.getPath("userData"), "temp_external");
  await fs.mkdir(tempDir, { recursive: true });
  const tempFilePath = path.join(tempDir, `${bookId}_${pageIndex}${ext}`);

  if (existsSync(tempFilePath)) {
    return tempFilePath;
  }

  const page = await readZipPage(zipPath, pageIndex);
  if (!page) {
    throw new Error("페이지를 찾을 수 없습니다.");
  }

  await fs.writeFile(tempFilePath, page.buffer);
  return tempFilePath;
}
