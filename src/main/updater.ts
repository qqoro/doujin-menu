import { app, BrowserWindow, ipcMain, shell } from "electron";
import log from "electron-log";
import updater from "electron-updater";
import semver from "semver"; // semver 추가
const { autoUpdater } = updater;

export interface GitHubReleaseResponse {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: Author;
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  immutable: boolean;
  prerelease: boolean;
  created_at: string;
  updated_at: string;
  published_at: string;
  assets: Asset[];
  tarball_url: string;
  zipball_url: string;
  body: string;
}

export interface Author {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  user_view_type: string;
  site_admin: boolean;
}

export interface Asset {
  url: string;
  id: number;
  node_id: string;
  name: string;
  label: string;
  uploader: Uploader;
  content_type: string;
  state: string;
  size: number;
  digest: string;
  download_count: number;
  created_at: string;
  updated_at: string;
  browser_download_url: string;
}

export interface Uploader {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  user_view_type: string;
  site_admin: boolean;
}

// 포터블 버전 감지 함수
function isPortable(): boolean {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
}

async function getLatestGitHubRelease(): Promise<GitHubReleaseResponse | null> {
  const url = `https://api.github.com/repos/qqoro/doujin-menu/releases/latest`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }
    const data = await response.json();
    return data as GitHubReleaseResponse;
  } catch (error) {
    log.error("최신 릴리즈 정보 가져오기 실패:", error);
    return null;
  }
}

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

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
    // 포터블 버전의 경우, 업데이트 실패 시 GitHub 릴리즈 페이지를 열어 수동 다운로드 유도
    if (isPortable()) {
      shell.openExternal("https://github.com/qqoro/doujin-menu/releases");
    }
  });

  ipcMain.handle("check-for-updates", async () => {
    if (isPortable()) {
      log.info(
        "Portable version detected. Checking for updates via GitHub API.",
      );
      const latestRelease = await getLatestGitHubRelease();
      if (latestRelease) {
        const currentVersion = app.getVersion();
        const latestVersion = latestRelease.tag_name.replace(/^v/, ""); // 'v' 접두사 제거
        log.info(
          `Current version: ${currentVersion}, Latest version: ${latestVersion}`,
        );

        if (semver.gt(latestVersion, currentVersion)) {
          const githubReleasesUrl =
            "https://github.com/qqoro/doujin-menu/releases";
          mainWindow.webContents.send("update-status", {
            status: "update-available-portable",
            info: { version: latestVersion },
            githubReleasesUrl: githubReleasesUrl,
          });
          return {
            success: true,
            portable: true,
            updateAvailable: true,
            latestVersion: latestVersion,
            githubReleasesUrl: githubReleasesUrl,
          };
        } else {
          mainWindow.webContents.send("update-status", {
            status: "update-not-available",
          });
          return { success: true, portable: true, updateAvailable: false };
        }
      } else {
        return {
          success: false,
          portable: true,
          error: "Failed to fetch latest release info.",
        };
      }
    } else {
      try {
        log.info("Checking for updates...");
        const result = await autoUpdater.checkForUpdates();
        return { success: true, portable: false, result };
      } catch (error) {
        log.error(`Failed to check for updates: ${(error as Error).message}`);
        return {
          success: false,
          portable: false,
          error: (error as Error).message,
        };
      }
    }
  });

  ipcMain.handle("download-update", async () => {
    if (isPortable()) {
      log.warn(
        "Download update is not supported for portable version. Please download manually from GitHub releases.",
      );
      shell.openExternal("https://github.com/qqoro/doujin-menu/releases");
      return {
        success: false,
        error: "Portable version requires manual download.",
      };
    } else {
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
    }
  });

  ipcMain.handle("install-update", async () => {
    if (isPortable()) {
      log.warn(
        "Install update is not supported for portable version. Please replace the executable manually.",
      );
      shell.openExternal("https://github.com/qqoro/doujin-menu/releases");
      return {
        success: false,
        error: "Portable version requires manual installation.",
      };
    } else {
      log.info("Installing update...");
      autoUpdater.quitAndInstall();
    }
  });

  // Check for updates on app start (optional, can be moved to a user setting)
  if (app.isPackaged && !isPortable()) {
    autoUpdater.checkForUpdates();
  }
}
