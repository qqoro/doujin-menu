import type { TypedIpcRenderer, Preset, FilterParams, LicenseInfo, UpdateCheckResult } from "../types/ipc";

// 타입이 지정된 IPC Renderer
export const ipcRenderer = window.require("electron")
  .ipcRenderer as TypedIpcRenderer;

// 재사용을 위해 export
export type { Preset, FilterParams, LicenseInfo, UpdateCheckResult };

export async function getBook(bookId: number) {
  return ipcRenderer.invoke("get-book", bookId);
}

export async function getStatistics() {
  return ipcRenderer.invoke("get-statistics");
}

export async function getLibrarySize() {
  return ipcRenderer.invoke("get-library-size");
}

export async function getRandomBook(filter: FilterParams) {
  const result = await ipcRenderer.invoke("get-random-book", filter);
  if (result.success) {
    return { id: result.bookId, title: result.bookTitle };
  } else {
    throw new Error(
      (typeof result.error === "string" ? result.error : String(result.error)) ||
        "Failed to get random book",
    );
  }
}

// Book Card Context Menu API
export async function toggleBookFavorite(bookId: number, isFavorite: boolean) {
  const result = await ipcRenderer.invoke("toggle-book-favorite", [
    bookId,
    isFavorite,
  ]);
  if (result.success) {
    return result.is_favorite;
  } else {
    throw new Error(
      (result.error as string) || "Failed to toggle book favorite status",
    );
  }
}

export async function openBookFolder(bookPath: string) {
  const result = await ipcRenderer.invoke("open-book-folder", bookPath);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to open book folder");
  }
}

export async function deleteBook(bookId: number) {
  const result = await ipcRenderer.invoke("delete-book", bookId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to delete book");
  }
}

export function openNewWindow(url: string) {
  ipcRenderer.send("open-new-window", url);
}

export async function getBookHistory({
  pageParam = 0,
  pageSize = 50,
}: {
  pageParam?: number;
  pageSize?: number;
}) {
  return ipcRenderer.invoke("get-book-history", { pageParam, pageSize });
}

export async function deleteBookHistory(historyId: number) {
  const result = await ipcRenderer.invoke("delete-book-history", historyId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to delete book history");
  }
}

export async function clearBookHistory() {
  const result = await ipcRenderer.invoke("clear-book-history");
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to clear book history");
  }
}

export async function addBookHistory(bookId: number) {
  const result = await ipcRenderer.invoke("add-book-history", bookId);
  if (!result.success) {
    console.error("Failed to add book history:", result.error);
  }
}

// Preset API
export async function getPresets(): Promise<Preset[]> {
  const result = await ipcRenderer.invoke("get-presets");
  if (result.success && result.data) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to get presets");
  }
}

export async function addPreset(preset: Omit<Preset, "id">): Promise<Preset> {
  const result = await ipcRenderer.invoke("add-preset", preset);
  if (result.success && result.data) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to add preset");
  }
}

export async function updatePreset(preset: Preset): Promise<Preset> {
  const result = await ipcRenderer.invoke("update-preset", preset);
  if (result.success && result.data) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to update preset");
  }
}

export async function deletePreset(id: number): Promise<{ id: number }> {
  const result = await ipcRenderer.invoke("delete-preset", id);
  if (result.success && result.data) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to delete preset");
  }
}

// Etc API
export async function getAppVersion(): Promise<string> {
  return ipcRenderer.invoke("get-app-version");
}

export function toggleDevTools() {
  ipcRenderer.send("toggle-dev-tools");
}

export function openExternalLink(url: string) {
  ipcRenderer.send("open-external-link", url);
}

export function openLogFolder() {
  ipcRenderer.send("open-log-folder");
}

export function closeCurrentWindow() {
  ipcRenderer.send("close-current-window");
}

export async function isNewWindow(): Promise<boolean> {
  return ipcRenderer.invoke("is-new-window");
}

export function setWindowTitle(title: string) {
  ipcRenderer.send("set-window-title", title);
}

// Update API
export async function checkUpdates(): Promise<UpdateCheckResult> {
  return ipcRenderer.invoke("check-for-updates");
}

export async function openGithubReleases(url: string): Promise<void> {
  return ipcRenderer.invoke("open-github-releases", url);
}

// Download Queue API
export async function getDownloadQueue() {
  const result = await ipcRenderer.invoke("get-download-queue");
  if (result.success && result.data) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to get download queue");
  }
}

export async function addToDownloadQueue(params: {
  galleryId: number;
  galleryTitle: string;
  galleryArtist?: string;
  thumbnailUrl?: string;
  downloadPath: string;
}) {
  const result = await ipcRenderer.invoke("add-to-download-queue", params);
  if (result.success && result.data) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to add to download queue");
  }
}

export async function removeFromDownloadQueue(queueId: number) {
  const result = await ipcRenderer.invoke("remove-from-download-queue", queueId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to remove from download queue");
  }
}

export async function pauseDownload(queueId: number) {
  const result = await ipcRenderer.invoke("pause-download", queueId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to pause download");
  }
}

export async function resumeDownload(queueId: number) {
  const result = await ipcRenderer.invoke("resume-download", queueId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to resume download");
  }
}

export async function retryDownload(queueId: number) {
  const result = await ipcRenderer.invoke("retry-download", queueId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to retry download");
  }
}

export async function clearCompletedDownloads() {
  const result = await ipcRenderer.invoke("clear-completed-downloads");
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "Failed to clear completed downloads");
  }
}
