// IPC 통신을 위한 타입 정의
import type { Gallery } from "node-hitomi";
import type { Config } from "../main/handlers/configHandler.js";

/** 읽음 상태 구간. 한 권은 반드시 한 구간에만 속한다 */
export type ReadStatus = "unread" | "reading" | "completed";

export interface FilterParams {
  searchQuery?: string;
  /** 고른 라이브러리 폴더들. 비었으면 전체 */
  libraryPath?: string[];
  /** 고른 읽음 상태 구간들. 비었으면 전체 */
  readStatus?: ReadStatus[];
  sortBy?: string; // title, added_at, file_mtime, last_read_at, artists, page_count, hitomi_id, random
  sortOrder?: "asc" | "desc";
  isFavorite?: boolean;
  offlineStatus?: "all" | "online" | "offline";
  randomSeed?: number; // 랜덤 정렬용 시드([0, 2^30) 정수) — 같은 시드면 항상 같은 순서
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
  rating?: number; // 0(미평가)~5
  is_offline?: boolean; // 라이브러리 폴더 접근 불가(외장하드 분리 등) 시 true
  last_read_at?: string;
  hitomi_id?: string;
  type?: string;
  added_at?: string;
  series_name?: string;
  series_collection_id?: number;
  series_order_index?: number;
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

export interface SeriesCollection {
  id: number;
  name: string;
  description: string | null;
  cover_image: string | null;
  is_auto_generated: boolean;
  is_manually_edited: boolean;
  confidence_score: number;
  created_at: string;
  updated_at: string;
  book_count?: number;
}

export interface SeriesCollectionWithBooks extends SeriesCollection {
  books: Book[];
}

export type DownloadQueueStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "paused";

export interface DownloadQueueItem {
  id: number;
  /** 다운로드 소스. 현재는 히토미뿐입니다. */
  source: string;
  /** 소스별 원본 식별자. 히토미는 갤러리 ID를 문자열로 적습니다. */
  source_key: string;
  gallery_id: number | null;
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

/** 구독 = 다운로더 검색어 문자열 하나 */
export interface Subscription {
  id: number;
  query: string;
  normalized_query: string;
  label?: string | null;
  enabled: boolean;
  /** 확인한 최대 갤러리 ID. null이면 기준선 미설정 */
  last_seen_id: number | null;
  created_at: string;
  last_checked_at: string | null;
}

/** 사이드바 빨간 점과 구독 탭 건수 표시에 쓰는 요약 */
export interface SubscriptionStatus {
  newCount: number;
  subscriptionCount: number;
  feedTotal: number;
  lastCheckedAt: string | null;
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
  topArtistsByViews: { name: string; view_count: number }[];
  topTagsByViews: { name: string; view_count: number }[];
  typeDistribution: { type: string; count: number }[];
  ratingStats: {
    average: number;
    ratedCount: number;
    distribution: { rating: number; count: number }[];
  };
  mostViewedBooks: { id: number; title: string; view_count: number }[];
  longestBook?: { id: number; title: string; page_count: number };
  shortestBook?: { id: number; title: string; page_count: number };
  duplicateBooks: {
    byTitle: { title: string; count: number }[];
    byHitomiId: { hitomi_id: string; count: number }[];
  };
}

// ========== 중복 책 정리 ==========

// 중복 그룹 내 개별 사본 정보
export interface DuplicateBookInfo extends Book {
  isArchive: boolean; // 경로 확장자(.zip/.cbz) 기준 압축파일 여부
  /** 압축파일은 스캔 시 저장된 값, 폴더는 조회 시점에 합산한 값. 접근 불가 시 null */
  file_size: number | null;
  file_mtime: number | null;
}

// 중복 그룹 (hitomi_id / 제목 완전 일치 / 정규화 제목 일치 / 표지 해시 유사)
export interface DuplicateGroup {
  key: string;
  /**
   * 아래로 갈수록 근거가 약하다. title_normalized는 표기 차이를 걷어낸 뒤에야
   * 묶인 그룹이고, cover_hash는 표지만 비슷할 뿐 다른 작품일 수 있다.
   */
  matchType: "hitomi_id" | "title" | "title_normalized" | "cover_hash";
  books: DuplicateBookInfo[];
}

// 중복 일괄 삭제 결과 (전체 성공 시에만 success: true, 부분 실패 시 false + errors에 사유 집계)
export interface DeleteDuplicatesResult {
  success: boolean;
  deletedCount: number;
  failedCount: number;
  errors: { bookId: number; error: string }[];
}

// 라이브러리 스캔 진행률 정보
export interface LibraryScanProgress {
  folderPath: string; // 스캔 중인 폴더 경로
  phase: "counting" | "scanning" | "thumbnails" | "series" | "completed"; // 현재 단계
  progress: number; // 0-100 진행률
  currentFile: string | null; // 현재 처리 중인 파일명
  processedCount: number; // 처리된 파일 수
  totalCount: number; // 전체 파일 수
  addedCount: number; // 추가된 책 수
  updatedCount: number; // 업데이트된 책 수
  deletedCount: number; // 삭제된 책 수
}

// IPC 채널 이름과 요청/응답 타입 매핑
export interface IpcChannels {
  // Book handlers
  "get-books": {
    request: FilterParams & {
      pageParam?: number;
      pageSize?: number;
      /** 총 건수 계산을 건너뛴다. 켜면 totalCount와 hasNextPage가 undefined */
      skipCount?: boolean;
    };
    response: {
      data: Book[];
      /** 필터가 적용된 전체 건수. skipCount면 undefined */
      totalCount: number | undefined;
      hasNextPage: boolean | undefined;
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
  "set-book-rating": {
    request: { bookId: number; rating: number };
    response: { success: boolean; rating?: number; error?: unknown };
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
  "check-books-exist-by-hitomi-ids": {
    request: number[]; // hitomiIds
    response: {
      success: boolean;
      /** { [hitomiId]: bookId } — 보유하지 않은 ID는 키가 없습니다 */
      data?: Record<number, number>;
      error?: string;
    };
  };
  "delete-book": {
    request: { bookId: number; permanent?: boolean };
    response: { success: boolean; error?: string };
  };
  "get-book-history": {
    request: {
      pageParam?: number;
      pageSize?: number;
      /** true면 총 건수 카운트를 건너뛴다 (청크 조회용) */
      skipCount?: boolean;
    };
    response: {
      data?: BookHistory[];
      /** 전체 기록 수. skipCount가 아니어야만 채워진다 */
      total?: number;
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

  // 중복 책 정리 핸들러
  "get-duplicate-groups": {
    request: void;
    response: { success: boolean; groups?: DuplicateGroup[]; error?: string };
  };
  "delete-duplicate-books": {
    request: { bookIds: number[]; permanent: boolean };
    response: DeleteDuplicatesResult;
  };
  "backfill-cover-hashes": {
    request: void;
    response: { success: boolean; hashedCount?: number; error?: string };
  };

  "get-library-size": {
    request: void;
    response: number;
  };
  "get-app-usage-stats": {
    request: void;
    response: {
      today: number;
      week: number;
      month: number;
      total: number;
      averageDaily: number;
      firstUsedAt: string | null;
      currentSessionStartTime: string | null;
    };
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
    response: Config;
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
  "select-external-image-viewer": {
    request: void;
    response: { success: boolean; data?: string; error?: string };
  };
  "select-external-archive-viewer": {
    request: void;
    response: { success: boolean; data?: string; error?: string };
  };
  "open-with-external-program": {
    request: { bookId: number; pageIndex: number };
    response: { success: boolean; error?: string };
  };
  "open-book-with-external-viewer": {
    request: { bookId: number };
    response: { success: boolean; error?: string };
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
    response: {
      success: boolean;
      added?: number;
      updated?: number;
      deleted?: number;
      offline?: boolean; // 폴더 접근 불가로 오프라인 처리됨
      offlineCount?: number; // 오프라인 처리된 책 수
      error?: string;
    };
  };
  "rescan-book-metadata": {
    request: number; // bookId
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
      searchQuery: string;
      popularityOrderBy?: "" | "day" | "week" | "month" | "year";
      start?: number;
      count?: number;
    };
    response: {
      success: boolean;
      data?: number[];
      total?: number;
      generation?: number;
      error?: string;
    };
  };
  "get-gallery-details": {
    request: number; // galleryId
    response: {
      success: boolean;
      data?: Gallery & { thumbnailUrl: string };
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
      /** 생략하면 String(galleryId)를 씁니다. */
      sourceKey?: string;
      galleryId?: number;
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

  // Subscription handlers
  "get-subscriptions": {
    request: void;
    response: {
      success: boolean;
      data?: Subscription[];
      /** 구독별 마지막 오류. 관리 팝오버의 실패 표시에 쓴다 */
      errors?: Record<number, string>;
      error?: string;
    };
  };
  "add-subscription": {
    request: { query: string; label?: string };
    response: { success: boolean; data?: Subscription; error?: string };
  };
  "update-subscription": {
    request: { id: number; query?: string; label?: string; enabled?: boolean };
    response: { success: boolean; error?: string };
  };
  "remove-subscription": {
    request: number; // subscriptionId
    response: { success: boolean; error?: string };
  };
  // 응답 모양을 search-galleries와 같게 맞춘다. 그래야 렌더러의 청크·가상 스크롤·
  // 좌표계(generation) 로직을 그대로 쓰고 채널만 갈아끼울 수 있다
  "get-subscription-feed": {
    request: { start: number; count: number };
    response: {
      success: boolean;
      data?: number[];
      total?: number;
      generation?: number;
      error?: string;
    };
  };
  "get-subscription-status": {
    request: void;
    response: { success: boolean; data?: SubscriptionStatus; error?: string };
  };
  "enter-subscription-tab": {
    request: void;
    response: { success: boolean; error?: string };
  };
  "refresh-subscriptions": {
    request: void;
    response: { success: boolean; error?: string };
  };

  // Series Collection handlers
  "get-series-collections": {
    request: {
      page?: number;
      limit?: number;
      filterType?: "all" | "auto" | "manual";
      minConfidence?: number;
      sortBy?: "name" | "book_count" | "confidence_score" | "created_at";
      sortOrder?: "asc" | "desc";
    };
    response: {
      success: boolean;
      data?: {
        collections: SeriesCollection[];
        pagination: {
          page: number;
          limit: number;
          totalCount: number;
          totalPages: number;
        };
      };
      error?: string;
    };
  };
  "get-series-collection-by-id": {
    request: number; // seriesId
    response: {
      success: boolean;
      data?: SeriesCollectionWithBooks;
      error?: string;
    };
  };
  "create-series-collection": {
    request: {
      name: string;
      confidence_score?: number;
      is_auto_generated?: boolean;
      is_manually_edited?: boolean;
      detection_reason?: string;
    };
    response: {
      success: boolean;
      data?: { id: number };
      error?: string;
    };
  };
  "update-series-collection": {
    request: {
      seriesId: number;
      data: {
        name?: string;
        confidence_score?: number;
        is_manually_edited?: boolean;
      };
    };
    response: {
      success: boolean;
      error?: string;
    };
  };
  "delete-series-collection": {
    request: number; // seriesId
    response: {
      success: boolean;
      error?: string;
    };
  };
  "run-series-detection": {
    request: {
      minConfidence?: number;
      minBooks?: number;
    };
    response: {
      success: boolean;
      data?: {
        created_count: number;
        processed_books: number;
      };
      error?: string;
    };
  };
  "run-series-detection-for-book": {
    request: {
      bookId: number;
      options?: {
        minConfidence?: number;
        minBooks?: number;
      };
    };
    response: {
      success: boolean;
      data?: {
        seriesName: string;
        confidence: number;
        books: Book[];
      } | null;
      error?: string;
    };
  };
  "auto-detect-series-for-book": {
    request: number;
    response: {
      success: boolean;
      matched: boolean;
      action?: "added_to_existing" | "new_series";
      error?: string;
    };
  };
  "add-book-to-series": {
    request: {
      bookId: number;
      seriesId: number;
      orderIndex?: number;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };
  "remove-book-from-series": {
    request: number; // bookId
    response: {
      success: boolean;
      error?: string;
    };
  };
  "reorder-books-in-series": {
    request: {
      seriesId: number;
      bookIds: number[];
    };
    response: {
      success: boolean;
      error?: string;
    };
  };
  "merge-series-collections": {
    request: {
      sourceId: number;
      targetId: number;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };
  "split-series-collection": {
    request: {
      sourceSeriesId: number;
      bookIds: number[];
      newSeriesName: string;
    };
    response: {
      success: boolean;
      data?: { newSeriesId: number };
      error?: string;
    };
  };
  "get-next-book-in-series": {
    request: number; // currentBookId
    response: {
      success: boolean;
      data?: { id: number; title: string } | null;
      error?: string;
    };
  };
  "get-previous-book-in-series": {
    request: number; // currentBookId
    response: {
      success: boolean;
      data?: { id: number; title: string } | null;
      error?: string;
    };
  };
  "get-series-books": {
    request: number; // seriesId
    response: {
      success: boolean;
      data?: Book[];
      error?: string;
    };
  };
  "get-series-navigation-book": {
    request: {
      currentBookId: number;
      direction: "next" | "previous";
    };
    response: {
      success: boolean;
      data?: { id: number; title: string } | null;
      error?: string;
    };
  };
  "cleanup-empty-series": {
    request: void;
    response: {
      success: boolean;
      data?: { cleaned_count: number };
      error?: string;
    };
  };

  // Browse handlers
  "get-artists-with-count": {
    request: void;
    response: { name: string; count: number }[];
  };
  "get-tags-with-count": {
    request: void;
    response: { name: string; count: number }[];
  };
  "get-series-with-count": {
    request: void;
    response: { name: string; count: number }[];
  };
  "get-characters-with-count": {
    request: void;
    response: { name: string; count: number }[];
  };
  "get-groups-with-count": {
    request: void;
    response: { name: string; count: number }[];
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
  "is-fullscreen-window": {
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
  "renderer-ready": void; // 렌더러 준비 완료 신호 (자동 스캔 결과 수신 준비)
}

// 다운로드 진행 상황 브로드캐스트 페이로드
export interface DownloadProgressEvent {
  galleryId: number;
  status: "starting" | "progress" | "completed" | "failed";
  progress?: number;
  error?: string;
}

// info.txt 일괄 생성 진행 상황 페이로드
export interface InfoGenerationProgress {
  total: number;
  current: number;
  message: string;
}

// 표지 해시 백필 진행률
export interface CoverHashProgress {
  total: number;
  current: number;
}

// 업데이트 상태 브로드캐스트 페이로드
export interface UpdateStatusEvent {
  status:
    | "update-available"
    | "update-available-portable"
    | "update-not-available"
    | "download-progress"
    | "update-downloaded"
    | "error";
  info?: { version: string };
  progressObj?: { percent: number };
  error?: string;
  githubReleasesUrl?: string;
}

// 메인 → 렌더러 푸시 이벤트. 값이 void면 페이로드가 없다.
// 메인에서는 src/main/utils/broadcast.ts의 broadcast/sendTo가,
// 렌더러에서는 TypedIpcRenderer의 on/off가 이 맵을 공유한다.
// 덕분에 한쪽에만 존재하는 채널(오타, 죽은 리스너)이 컴파일 단계에서 걸린다.
export interface IpcListenChannels {
  "books-updated": void;
  "book-history-updated": void;
  "series-collections-updated": void;
  "download-queue-updated": void;
  "library-scan-completed": void;
  "library-scan-progress": LibraryScanProgress;
  "info-generation-progress": InfoGenerationProgress;
  "cover-hash-progress": CoverHashProgress;
  "window-maximized": boolean;
  "download-progress": DownloadProgressEvent;
  "update-status": UpdateStatusEvent;
  // void 신호다. 받은 쪽이 get-subscription-status로 당겨간다
  // (books-updated 등과 같은 관례. push 전용으로 두면 Ctrl+R 직후 상태가 빈다)
  "subscriptions-updated": void;
  // 토스트용. broadcast가 아니라 메인 창에만 보낸다 — 뷰어 창에도 뜨면 안 된다
  "subscription-new-found": { subscriptionCount: number; newCount: number };
}

// 페이로드가 없는 채널은 리스너도 event만 받는다.
export type IpcListener<K extends keyof IpcListenChannels> =
  IpcListenChannels[K] extends void
    ? (event: Electron.IpcRendererEvent) => void
    : (event: Electron.IpcRendererEvent, payload: IpcListenChannels[K]) => void;

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

  on<K extends keyof IpcListenChannels>(
    channel: K,
    listener: IpcListener<K>,
  ): void;

  off<K extends keyof IpcListenChannels>(
    channel: K,
    listener: IpcListener<K>,
  ): void;

  removeAllListeners<K extends keyof IpcListenChannels>(channel: K): void;
}
