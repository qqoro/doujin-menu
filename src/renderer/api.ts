import type { ipcRenderer as invoke } from "electron";

export const ipcRenderer = window.require("electron")
  .ipcRenderer as typeof invoke;

export interface Preset {
  id: number;
  name: string;
  query: string;
}

export interface FilterParams {
  searchQuery?: string;
  libraryPath?: string;
  readStatus?: "all" | "read" | "unread";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  isFavorite?: boolean;
}

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
    throw new Error(result.error || "Failed to get random book");
  }
}

// Book Card Context Menu API
export async function toggleBookFavorite(bookId: number, isFavorite: boolean) {
  const result = await ipcRenderer.invoke(
    "toggle-book-favorite",
    bookId,
    isFavorite,
  );
  if (result.success) {
    return result.is_favorite;
  } else {
    throw new Error(result.error || "Failed to toggle book favorite status");
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
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to get presets");
  }
}

export async function addPreset(preset: Omit<Preset, "id">): Promise<Preset> {
  const result = await ipcRenderer.invoke("add-preset", preset);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to add preset");
  }
}

export async function updatePreset(preset: Preset): Promise<Preset> {
  const result = await ipcRenderer.invoke("update-preset", preset);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to update preset");
  }
}

export async function deletePreset(id: number): Promise<{ id: number }> {
  const result = await ipcRenderer.invoke("delete-preset", id);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "Failed to delete preset");
  }
}

export interface LicenseInfo {
  name: string;
  version: string;
  licenses: string;
  repository?: string;
  publisher?: string;
  licenseText?: string;
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

// Update API
export interface UpdateCheckResult {
  success: boolean;
  portable: boolean;
  githubReleasesUrl?: string;
  result?: {
    updateAvailable: boolean;
    version: string;
    releaseName: string;
    releaseDate: string;
    // 기타 electron-updater 결과 필드
  };
  error?: string;
}

export async function checkUpdates(): Promise<UpdateCheckResult> {
  return ipcRenderer.invoke("check-for-updates");
}

export async function openGithubReleases(url: string): Promise<void> {
  return ipcRenderer.invoke("open-github-releases", url);
}
