import { BrowserWindow, ipcMain } from "electron";

// 윈도우 최소화
export const handleMinimizeWindow = (mainWindow: BrowserWindow | null) => {
  mainWindow?.minimize();
};

// 윈도우 최대화 토글
export const handleMaximizeToggle = (win: BrowserWindow) => {
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
};

// 전체화면 설정
export const handleSetFullscreen = (win: BrowserWindow, newState: boolean) => {
  win.setSimpleFullScreen(newState);
};

// 전체화면 토글
export const handleFullscreenToggle = (win: BrowserWindow) => {
  win.setSimpleFullScreen(!win.isSimpleFullScreen());
};

// 전체화면 상태 확인
export const handleIsFullscreen = (win: BrowserWindow): boolean => {
  return win.isSimpleFullScreen();
};

// 메인 윈도우 닫기
export const handleCloseWindow = (mainWindow: BrowserWindow | null) => {
  mainWindow?.close();
};

// 현재 윈도우 닫기
export const handleCloseCurrentWindow = (win: BrowserWindow) => {
  win.close();
};

// 윈도우 타이틀 설정
export const handleSetWindowTitle = (win: BrowserWindow, title: string) => {
  win.setTitle(title);
};

// 새 윈도우인지 확인
export const handleIsNewWindow = (
  win: BrowserWindow,
  viewerWindows: Set<BrowserWindow>,
): boolean => {
  return viewerWindows.has(win);
};

// IPC 핸들러 등록
export function registerWindowHandlers(
  mainWindow: BrowserWindow | null,
  createViewerWindow: (url: string) => void,
  viewerWindows: Set<BrowserWindow>,
) {
  // 창 제어 IPC 핸들러
  ipcMain.on("minimize-window", () => {
    handleMinimizeWindow(mainWindow);
  });

  ipcMain.on("maximize-toggle-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) handleMaximizeToggle(win);
  });

  ipcMain.on("set-fullscreen-window", (event, newState: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) handleSetFullscreen(win, newState);
  });

  ipcMain.on("fullscreen-toggle-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) handleFullscreenToggle(win);
  });

  ipcMain.handle("is-fullscreen-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? handleIsFullscreen(win) : false;
  });

  ipcMain.on("close-window", () => {
    handleCloseWindow(mainWindow);
  });

  ipcMain.on("close-current-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) handleCloseCurrentWindow(win);
  });

  ipcMain.on("set-window-title", (event, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) handleSetWindowTitle(win, title);
  });

  ipcMain.on("open-new-window", (_event, url: string) => {
    createViewerWindow(url);
  });

  ipcMain.handle("is-new-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? handleIsNewWindow(win, viewerWindows) : false;
  });
}
