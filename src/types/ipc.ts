// IPC 통신을 위한 타입 정의

export interface FilterParams {
  searchQuery?: string;
  libraryPath?: string;
  readStatus?: "all" | "read" | "unread";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  isFavorite?: boolean;
}

export interface Preset {
  id: number;
  name: string;
  query: string;
}

export interface LicenseInfo {
  name: string;
  version: string;
  licenses: string;
  repository?: string;
  publisher?: string;
  licenseText?: string;
}

export interface UpdateCheckResult {
  success: boolean;
  portable: boolean;
  githubReleasesUrl?: string;
  result?: {
    updateAvailable: boolean;
    version: string;
    releaseName: string;
    releaseDate: string;
  };
  error?: string;
}

export interface Book {
  id: number;
  title: string;
  path: string;
  cover_path?: string;
  page_count?: number;
  current_page?: number;
  is_favorite: boolean;
  last_read_at?: string;
  hitomi_id?: string;
  type?: string;
  added_at?: string;
  series_name?: string;
  language_name_english?: string;
  language_name_local?: string;
  artists: { name: string }[];
  tags: { name: string }[];
  series: { name: string }[];
  groups: { name: string }[];
  characters: { name: string }[];
}

export interface BookHistory {
  history_id: number;
  viewed_at: string;
  id: number;
  title: string;
  cover_path?: string;
}

export type DownloadQueueStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "paused";

export interface DownloadQueueItem {
  id: number;
  gallery_id: number;
  gallery_title: string;
  gallery_artist?: string;
  thumbnail_url?: string;
  download_path: string;
  status: DownloadQueueStatus;
  progress: number;
  total_files: number;
  downloaded_files: number;
  download_speed: number;
  error_message?: string;
  added_at: string;
  started_at?: string;
  completed_at?: string;
  priority: number;
}

export interface Statistics {
  totalBooks: number;
  readingProgress: {
    read: number;
    reading: number;
    unread: number;
    favorites: number;
  };
  totalPages: number;
  readPages: number;
  averagePages: number;
  topTags: { name: string; count: number }[];
  topArtists: { name: string; count: number }[];
  topGroups: { name: string; count: number }[];
  topCharacters: { name: string; count: number }[];
  topSeries: { name: string; count: number }[];
  typeDistribution: { type: string; count: number }[];
  mostViewedBooks: { id: number; title: string; view_count: number }[];
  longestBook?: { id: number; title: string; page_count: number };
  shortestBook?: { id: number; title: string; page_count: number };
  duplicateBooks: {
    byTitle: { title: string; count: number }[];
    byHitomiId: { hitomi_id: string; count: number }[];
  };
}

// IPC 채널 이름과 요청/응답 타입 매핑
export interface IpcChannels {
  // Book handlers
  "get-books": {
    request: FilterParams & { pageParam?: number; pageSize?: number };
    response: {
      data: Book[];
      hasNextPage: boolean;
      nextPage: number;
    };
  };
  "get-book": {
    request: number; // bookId
    response: Book | null;
  };
  "get-tags": {
    request: void;
    response: { id: number; name: string }[];
  };
  "get-artists": {
    request: void;
    response: { id: number; name: string }[];
  };
  "get-series": {
    request: void;
    response: { id: number; name: string }[];
  };
  "get-groups": {
    request: void;
    response: { id: number; name: string }[];
  };
  "get-characters": {
    request: void;
    response: { id: number; name: string }[];
  };
  "get-types": {
    request: void;
    response: { type: string }[];
  };
  "get-languages": {
    request: void;
    response: { name: string }[];
  };
  "get-book-page-paths": {
    request: number; // bookId
    response: {
      success: boolean;
      data?: string[];
      title?: string;
      is_favorite?: boolean;
      error?: string;
    };
  };
  "update-book-current-page": {
    request: { bookId: number; currentPage: number };
    response: { success: boolean; error?: unknown };
  };
  "get-book-current-page": {
    request: number; // bookId
    response: { success: boolean; currentPage?: number; error?: unknown };
  };
  "get-library-folder-stats": {
    request: string; // folderPath
    response: {
      success: boolean;
      data?: { bookCount: number; lastScanned: string };
      error?: unknown;
    };
  };
  "get-next-book": {
    request: {
      currentBookId: number;
      mode: "next" | "random";
      filter: FilterParams | null;
    };
    response: {
      success: boolean;
      nextBookId?: number | null;
      nextBookTitle?: string;
      error?: string;
    };
  };
  "get-prev-book": {
    request: {
      currentBookId: number;
      filter: FilterParams | null;
    };
    response: {
      success: boolean;
      prevBookId?: number | null;
      prevBookTitle?: string;
      error?: string;
    };
  };
  "get-random-book": {
    request: FilterParams | null;
    response: {
      success: boolean;
      bookId?: number;
      bookTitle?: string;
      error?: unknown;
    };
  };
  "toggle-book-favorite": {
    request: { bookId: number; isFavorite: boolean };
    response: { success: boolean; is_favorite?: boolean; error?: unknown };
  };
  "open-book-folder": {
    request: string; // bookPath
    response: { success: boolean; error?: string };
  };
  "add-book-history": {
    request: number; // bookId
    response: { success: boolean; error?: unknown };
  };
  "check-book-exists-by-hitomi-id": {
    request: number; // hitomiId
    response: {
      success: boolean;
      exists?: boolean;
      bookId?: number | null;
      error?: unknown;
    };
  };
  "delete-book": {
    request: number; // bookId
    response: { success: boolean; error?: string };
  };
  "get-book-history": {
    request: { pageParam?: number; pageSize?: number };
    response: {
      data?: BookHistory[];
      hasNextPage?: boolean;
      nextPage?: number;
      success?: boolean;
      error?: string;
    };
  };
  "delete-book-history": {
    request: number; // historyId
    response: { success: boolean; error?: string };
  };
  "clear-book-history": {
    request: void;
    response: { success: boolean; error?: string };
  };

  // Statistics handlers
  "get-statistics": {
    request: void;
    response: Statistics;
  };
  "get-library-size": {
    request: void;
    response: number;
  };

  // Preset handlers
  "get-presets": {
    request: void;
    response: { success: boolean; data?: Preset[]; error?: string };
  };
  "add-preset": {
    request: Omit<Preset, "id">;
    response: { success: boolean; data?: Preset; error?: string };
  };
  "update-preset": {
    request: Preset;
    response: { success: boolean; data?: Preset; error?: string };
  };
  "delete-preset": {
    request: number; // id
    response: { success: boolean; data?: { id: number }; error?: string };
  };

  // Config handlers
  "get-config": {
    request: void;
    response: Record<string, unknown>;
  };
  "get-config-value": {
    request: string; // key
    response: unknown;
  };
  "set-config": {
    request: { key: string; value: unknown };
    response: { success: boolean; error?: string };
  };
  "rescan-all-metadata": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "add-library-folder": {
    request: void;
    response: {
      success: boolean;
      folders?: string[];
      added?: string[];
      alreadyExists?: string[];
      error?: string;
    };
  };
  "remove-library-folder": {
    request: string; // folderPath
    response: { success: boolean; error?: string };
  };
  "backup-database": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "restore-database": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "reset-all-data": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "set-lock-password": {
    request: string; // password
    response: { success: boolean; error?: string };
  };
  "clear-lock-password": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "verify-lock-password": {
    request: string; // password
    response: { success: boolean; valid?: boolean; error?: string };
  };

  // Directory handlers
  "add-books-from-directory": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "select-folder": {
    request: void;
    response: { success: boolean; path?: string };
  };
  "rescan-library-folder": {
    request: string; // folderPath
    response: { success: boolean; error?: string };
  };

  // Thumbnail handlers
  "generate-thumbnail": {
    request: number; // bookId
    response: { success: boolean; error?: string };
  };
  "regenerate-all-thumbnails": {
    request: void;
    response: { success: boolean; error?: string };
  };

  // Downloader handlers
  "search-galleries": {
    request: {
      query: { searchQuery: string; offset?: number };
      page: number;
    };
    response: {
      success: boolean;
      data?: number[];
      hasNextPage?: boolean;
      error?: string;
    };
  };
  "get-gallery-details": {
    request: number; // galleryId
    response: {
      success: boolean;
      data?: unknown; // Gallery + thumbnailUrl
      error?: string;
    };
  };
  "get-gallery-image-urls": {
    request: number; // galleryId
    response: {
      success: boolean;
      data?: string[];
      error?: string;
    };
  };
  "download-gallery": {
    request: { galleryId: number; downloadPath: string };
    response: { success: boolean; error?: string; paused?: boolean };
  };
  "download-temp-thumbnail": {
    request: { url: string; referer: string; galleryId: number };
    response: { success: boolean; data?: string; error?: string };
  };

  // Download Queue handlers
  "get-download-queue": {
    request: void;
    response: { success: boolean; data?: DownloadQueueItem[]; error?: string };
  };
  "add-to-download-queue": {
    request: {
      galleryId: number;
      galleryTitle: string;
      galleryArtist?: string;
      thumbnailUrl?: string;
      downloadPath: string;
    };
    response: { success: boolean; data?: DownloadQueueItem; error?: string };
  };
  "remove-from-download-queue": {
    request: number; // queueId
    response: { success: boolean; error?: string };
  };
  "pause-download": {
    request: number; // queueId
    response: { success: boolean; error?: string };
  };
  "resume-download": {
    request: number; // queueId
    response: { success: boolean; error?: string };
  };
  "retry-download": {
    request: number; // queueId
    response: { success: boolean; error?: string };
  };
  "clear-completed-downloads": {
    request: void;
    response: { success: boolean; error?: string };
  };

  // Etc handlers
  "get-app-version": {
    request: void;
    response: string;
  };
  "is-new-window": {
    request: void;
    response: boolean;
  };
  "get-temp-files-size": {
    request: void;
    response: { success: boolean; data?: string; error?: string };
  };
  "clear-temp-files": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "generate-missing-info-files": {
    request: string; // pattern
    response: { success: boolean; error?: string };
  };
  "open-folder": {
    request: string; // folderPath
    response: { success: boolean; error?: string };
  };

  // Window handlers
  "get-window-maximized-state": {
    request: void;
    response: boolean;
  };
  "get-initial-lock-status": {
    request: void;
    response: { locked: boolean };
  };

  // Updater handlers
  "check-for-updates": {
    request: void;
    response: UpdateCheckResult;
  };
  "download-update": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "install-update": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "open-github-releases": {
    request: string; // url
    response: void;
  };
}

// IPC send 이벤트 (응답 없음)
export interface IpcSendChannels {
  "open-new-window": string; // url
  "toggle-dev-tools": void;
  "open-external-link": string; // url
  "open-log-folder": void;
  "close-current-window": void;
  "close-window": void;
  "set-window-title": string; // title
  "minimize-window": void;
  "maximize-toggle-window": void;
  "set-fullscreen-window": boolean; // newState
  "fullscreen-toggle-window": void;
  "start-download": {
    url: string;
    galleryId: string;
    downloadPath: string;
    autoZip: boolean;
  };
  "cancel-download": string; // galleryId
}

// Typed IpcRenderer wrapper
export interface TypedIpcRenderer {
  invoke<K extends keyof IpcChannels>(
    channel: K,
    ...args: IpcChannels[K]["request"] extends void
      ? []
      : [IpcChannels[K]["request"]]
  ): Promise<IpcChannels[K]["response"]>;

  send<K extends keyof IpcSendChannels>(
    channel: K,
    ...args: IpcSendChannels[K] extends void ? [] : [IpcSendChannels[K]]
  ): void;

  on(
    channel: string,
    listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void,
  ): void;

  off(
    channel: string,
    listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void,
  ): void;

  removeAllListeners(channel: string): void;
}
