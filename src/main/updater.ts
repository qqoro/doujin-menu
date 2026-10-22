import { app, BrowserWindow, ipcMain, shell } from "electron";
import log from "electron-log";
import updater from "electron-updater";
import semver from "semver"; // semver 추가
import type { UpdateCheckResult } from "../types/ipc.js";
import { sendTo } from "./utils/broadcast.js";
const { autoUpdater } = updater;

const RELEASES_PAGE_URL = "https://github.com/qqoro/doujin-menu/releases";

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
    sendTo(mainWindow.webContents, "update-status", {
      status: "update-available",
      info,
    });
  });

  autoUpdater.on("update-not-available", () => {
    log.info("Update not available.");
    sendTo(mainWindow.webContents, "update-status", {
      status: "update-not-available",
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    log.info(`Download progress: ${progressObj.percent}%`);
    sendTo(mainWindow.webContents, "update-status", {
      status: "download-progress",
      progressObj,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(`Update downloaded: ${info.version}`);
    sendTo(mainWindow.webContents, "update-status", {
      status: "update-downloaded",
      info,
    });
  });

  autoUpdater.on("error", (err) => {
    log.error(`Update error: ${err.message}`);
    sendTo(mainWindow.webContents, "update-status", {
      status: "error",
      error: err.message,
    });
  });

  // 포터블 확인으로 찾은 새 버전의 릴리즈 페이지
  let portableReleaseUrl: string | null = null;

  const checkForUpdates = async (): Promise<UpdateCheckResult> => {
    if (isPortable()) {
      // 포터블 빌드에는 app-update.yml이 없어 electron-updater를 쓸 수 없다
      log.info(
        "Portable version detected. Checking for updates via GitHub API.",
      );
      const latestRelease = await getLatestGitHubRelease();
      if (!latestRelease) {
        return {
          success: false,
          portable: true,
          error: "Failed to fetch latest release info.",
        };
      }

      const currentVersion = app.getVersion();
      const latestVersion = latestRelease.tag_name.replace(/^v/, ""); // 'v' 접두사 제거
      log.info(
        `Current version: ${currentVersion}, Latest version: ${latestVersion}`,
      );

      if (!semver.gt(latestVersion, currentVersion)) {
        sendTo(mainWindow.webContents, "update-status", {
          status: "update-not-available",
        });
        return { success: true, portable: true };
      }

      portableReleaseUrl = latestRelease.html_url;
      sendTo(mainWindow.webContents, "update-status", {
        status: "update-available-portable",
        info: { version: latestVersion },
        githubReleasesUrl: portableReleaseUrl,
      });
      return {
        success: true,
        portable: true,
        githubReleasesUrl: portableReleaseUrl,
        result: {
          updateAvailable: true,
          version: latestVersion,
          releaseName: latestRelease.name,
          releaseDate: latestRelease.published_at,
        },
      };
    }

    try {
      log.info("Checking for updates...");
      // 결과는 autoUpdater 이벤트(update-status)로 전달된다
      await autoUpdater.checkForUpdates();
      return { success: true, portable: false };
    } catch (error) {
      log.error(`Failed to check for updates: ${(error as Error).message}`);
      return {
        success: false,
        portable: false,
        error: (error as Error).message,
      };
    }
  };

  ipcMain.handle("check-for-updates", () => checkForUpdates());

  ipcMain.handle("download-update", async () => {
    if (isPortable()) {
      shell.openExternal(portableReleaseUrl ?? RELEASES_PAGE_URL);
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
      shell.openExternal(portableReleaseUrl ?? RELEASES_PAGE_URL);
      return {
        success: false,
        error: "Portable version requires manual installation.",
      };
    } else {
      log.info("Installing update...");
      // 설치 마법사 없이 기존 경로에 조용히 설치하고, 끝나면 앱을 다시 실행
      autoUpdater.quitAndInstall(true, true);
    }
  });

  // 리스너 등록 전에 결과를 보내면 토스트가 사라지므로 renderer-ready 이후에 확인한다
  let hasCheckedOnStartup = false;
  ipcMain.on("renderer-ready", () => {
    // Ctrl+R로 renderer-ready가 재전송돼도 최초 1회만 확인
    if (hasCheckedOnStartup || !app.isPackaged) return;
    hasCheckedOnStartup = true;
    checkForUpdates();
  });
}
