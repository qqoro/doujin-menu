import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain, shell } from "electron";
import fs from "fs/promises";
import hitomi from "node-hitomi";
import path from "path";
import { store as configStore } from "./configHandler.js";

async function handleGenerateMissingInfoFiles(event: IpcMainInvokeEvent) {
  const libraryFolders = configStore.get("libraryFolders", []);
  if (!libraryFolders.length) {
    return {
      success: true,
      data: { createdCount: 0, skippedCount: 0, errorCount: 0 },
      message: "라이브러리 폴더가 설정되지 않았습니다.",
    };
  }

  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  // 1. 전체 폴더 수 계산
  let totalFolders = 0;
  for (const folderPath of libraryFolders) {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      totalFolders += entries.filter((entry) => entry.isDirectory()).length;
    } catch (error) {
      console.error(`Error reading library folder for counting ${folderPath}:`, error);
    }
  }

  event.sender.send("info-generation-progress", {
    total: totalFolders,
    current: 0,
    message: "작업을 시작합니다...",
  });

  // 2. 실제 처리
  for (const folderPath of libraryFolders) {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const subfolders = entries.filter((entry) => entry.isDirectory());

      for (const subfolder of subfolders) {
        processedCount++;
        const subfolderPath = path.join(folderPath, subfolder.name);
        const infoFilePath = path.join(subfolderPath, "info.txt");
        let statusMessage = "";

        try {
          await fs.access(infoFilePath);
          statusMessage = `건너뜀 (파일 있음): ${subfolder.name}`;
          skippedCount++;
        } catch {
          // info.txt가 없는 경우
          const match = subfolder.name.match(/\((\d+)\)$/);
          if (match && match[1]) {
            const galleryId = parseInt(match[1], 10);
            try {
              const gallery = await hitomi.getGallery(galleryId);
              if (gallery) {
                const infoContent = [
                  `갤러리 넘버: ${gallery.id}`,
                  `제목: ${gallery.title.display}`,
                  `작가: ${gallery.artists?.join(", ") || "N/A"}`,
                  `그룹: ${gallery.groups?.join(", ") || "N/A"}`,
                  `타입: ${gallery.type || "N/A"}`,
                  `시리즈: ${gallery.series?.join(", ") || "N/A"}`,
                  `캐릭터: ${gallery.characters?.join(", ") || "N/A"}`,
                  `태그: ${ 
                    gallery.tags
                      ?.map((t) =>
                        t.type === "male" || t.type === "female"
                          ? `${t.type}:${t.name}`
                          : t.name,
                      )
                      .join(", ") || "N/A"
                  }`,
                  `언어: ${gallery.languageName?.english || "N/A"}`,
                ].join("\n");

                await fs.writeFile(infoFilePath, infoContent);
                statusMessage = `생성 완료: ${subfolder.name}`;
                createdCount++;
              } else {
                statusMessage = `오류 (갤러리 없음): ${subfolder.name}`;
                errorCount++;
              }
            } catch (error) {
              console.error(
                `Error fetching gallery info for ID ${galleryId}:`,
                error,
              );
              statusMessage = `오류 (정보 조회 실패): ${subfolder.name}`;
              errorCount++;
            }
          } else {
            statusMessage = `건너뜀 (ID 없음): ${subfolder.name}`;
            skippedCount++;
          }
        }

        event.sender.send("info-generation-progress", {
          total: totalFolders,
          current: processedCount,
          message: statusMessage,
        });
      }
    } catch (error) {
      console.error(`Error reading library folder ${folderPath}:`, error);
      errorCount++;
    }
  }

  const finalMessage = `작업 완료: ${createdCount}개 생성, ${skippedCount}개 건너뜀, ${errorCount}개 오류`;
  event.sender.send("info-generation-progress", {
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
    shell.openExternal(url);
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

  // info.txt 없는 폴더에 파일 생성
  ipcMain.handle("generate-missing-info-files", (event) =>
    handleGenerateMissingInfoFiles(event),
  );
}
