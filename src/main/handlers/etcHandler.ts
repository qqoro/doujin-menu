import type { BrowserWindow } from "electron";
import { app, ipcMain, shell } from "electron";

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
}
