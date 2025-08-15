import { app, BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import updater from "electron-updater";
const { autoUpdater } = updater;

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  autoUpdater.logger = log; // Use electron-log for autoUpdater
  autoUpdater.autoDownload = false; // We'll trigger download manually
  autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

  autoUpdater.on("update-available", (info) => {
    log.info(`Update available: ${info.version}`);
    mainWindow.webContents.send("update-status", {
      status: "update-available",
      info,
    });
  });

  autoUpdater.on("update-not-available", () => {
    log.info("Update not available.");
    mainWindow.webContents.send("update-status", {
      status: "update-not-available",
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    log.info(`Download progress: ${progressObj.percent}%`);
    mainWindow.webContents.send("update-status", {
      status: "download-progress",
      progressObj,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(`Update downloaded: ${info.version}`);
    mainWindow.webContents.send("update-status", {
      status: "update-downloaded",
      info,
    });
  });

  autoUpdater.on("error", (err) => {
    log.error(`Update error: ${err.message}`);
    mainWindow.webContents.send("update-status", {
      status: "error",
      error: err.message,
    });
  });

  // IPC handlers for update
  ipcMain.handle("check-for-updates", async () => {
    try {
      log.info("Checking for updates...");
      const result = await autoUpdater.checkForUpdates();
      return { success: true, result };
    } catch (error) {
      log.error(`Failed to check for updates: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("download-update", async () => {
    try {
      log.info("Downloading update...");
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error(`Failed to download update: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("install-update", async () => {
    log.info("Installing update...");
    autoUpdater.quitAndInstall();
  });

  // Check for updates on app start (optional, can be moved to a user setting)
  if (app.isPackaged) {
    // Only check for updates in packaged app
    autoUpdater.checkForUpdates();
  }
}
