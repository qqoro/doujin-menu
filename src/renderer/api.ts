import type {
  FilterParams,
  Preset,
  TypedIpcRenderer,
  UpdateCheckResult,
} from "../types/ipc";

// 타입이 지정된 IPC Renderer
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore electron 전용 API
export const ipcRenderer = window.require("electron")
  .ipcRenderer as TypedIpcRenderer;

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
      (typeof result.error === "string"
        ? result.error
        : String(result.error)) || "Failed to get random book",
    );
  }
}

// Book Card Context Menu API
export async function toggleBookFavorite(bookId: number, isFavorite: boolean) {
  const result = await ipcRenderer.invoke("toggle-book-favorite", {
    bookId,
    isFavorite,
  });
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

export async function isFullscreen(): Promise<boolean> {
  return ipcRenderer.invoke("is-fullscreen-window");
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
  const result = await ipcRenderer.invoke(
    "remove-from-download-queue",
    queueId,
  );
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

// ============================================================
// 시리즈 컬렉션 API
// ============================================================

/**
 * 시리즈 컬렉션 목록 조회
 */
export async function getSeriesCollections(params?: {
  page?: number;
  limit?: number;
  filterType?: "all" | "auto" | "manual";
  minConfidence?: number;
  sortBy?: "name" | "book_count" | "confidence" | "created_at";
  sortOrder?: "asc" | "desc";
}) {
  const result = await ipcRenderer.invoke("get-series-collections", params || {});
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "시리즈 목록 조회 실패");
  }
}

/**
 * 특정 시리즈 컬렉션 상세 조회
 */
export async function getSeriesCollectionById(seriesId: number) {
  const result = await ipcRenderer.invoke("get-series-collection-by-id", seriesId);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "시리즈 조회 실패");
  }
}

/**
 * 시리즈 컬렉션 생성
 */
export async function createSeriesCollection(data: {
  name: string;
  description?: string;
  cover_image?: string;
}) {
  const result = await ipcRenderer.invoke("create-series-collection", data);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "시리즈 생성 실패");
  }
}

/**
 * 시리즈 컬렉션 수정
 */
export async function updateSeriesCollection(seriesId: number, data: {
  name?: string;
  confidence_score?: number;
  is_manually_edited?: boolean;
}) {
  const result = await ipcRenderer.invoke("update-series-collection", { seriesId, data });
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "시리즈 수정 실패");
  }
}

/**
 * 시리즈 컬렉션 삭제
 */
export async function deleteSeriesCollection(seriesId: number) {
  const result = await ipcRenderer.invoke("delete-series-collection", seriesId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "시리즈 삭제 실패");
  }
}

/**
 * 자동 시리즈 감지 실행
 */
export async function runSeriesDetection(options?: {
  minConfidence?: number;
  minBooks?: number;
}) {
  const result = await ipcRenderer.invoke("run-series-detection", options || {});
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "자동 감지 실행 실패");
  }
}

/**
 * 특정 책에 대한 시리즈 감지
 */
export async function runSeriesDetectionForBook(
  bookId: number,
  options?: {
    minConfidence?: number;
    minBooks?: number;
  },
) {
  const result = await ipcRenderer.invoke("run-series-detection-for-book", {
    bookId,
    options,
  });
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "책 시리즈 감지 실패");
  }
}

/**
 * 시리즈에 책 추가
 */
export async function addBookToSeries(
  bookId: number,
  seriesId: number,
  orderIndex?: number,
) {
  const result = await ipcRenderer.invoke("add-book-to-series", {
    bookId,
    seriesId,
    orderIndex,
  });
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "시리즈에 책 추가 실패");
  }
}

/**
 * 시리즈에서 책 제거
 */
export async function removeBookFromSeries(bookId: number) {
  const result = await ipcRenderer.invoke("remove-book-from-series", bookId);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "시리즈에서 책 제거 실패");
  }
}

/**
 * 시리즈 내 책 순서 변경
 */
export async function reorderBooksInSeries(
  seriesId: number,
  bookIds: number[],
) {
  const result = await ipcRenderer.invoke("reorder-books-in-series", {
    seriesId,
    bookIds,
  });
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "책 순서 변경 실패");
  }
}

/**
 * 시리즈 병합
 */
export async function mergeSeriesCollections(
  sourceId: number,
  targetId: number,
) {
  const result = await ipcRenderer.invoke("merge-series-collections", {
    sourceId,
    targetId,
  });
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || "시리즈 병합 실패");
  }
}

/**
 * 시리즈 분할
 */
export async function splitSeriesCollection(
  sourceSeriesId: number,
  bookIds: number[],
  newSeriesName: string,
) {
  const result = await ipcRenderer.invoke("split-series-collection", {
    sourceSeriesId,
    bookIds,
    newSeriesName,
  });
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "시리즈 분할 실패");
  }
}

/**
 * 시리즈의 다음 권 조회
 */
export async function getNextBookInSeries(currentBookId: number) {
  const result = await ipcRenderer.invoke("get-next-book-in-series", currentBookId);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "다음 권 조회 실패");
  }
}

/**
 * 시리즈의 이전 권 조회
 */
export async function getPreviousBookInSeries(currentBookId: number) {
  const result = await ipcRenderer.invoke("get-previous-book-in-series", currentBookId);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "이전 권 조회 실패");
  }
}

/**
 * 시리즈의 전체 책 목록 조회
 */
export async function getSeriesBooks(seriesId: number) {
  const result = await ipcRenderer.invoke("get-series-books", seriesId);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error || "시리즈 책 목록 조회 실패");
  }
}
