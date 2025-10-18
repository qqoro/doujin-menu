import { ipcRenderer, setWindowTitle } from "@/api";
import { watchDebounced } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, nextTick, ref, toRaw, watch } from "vue";
import { useRouter } from "vue-router";

export interface FilterParams {
  searchQuery?: string;
  libraryPath?: string;
  readStatus?: "all" | "read" | "unread";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  isFavorite?: boolean;
}

export const useViewerStore = defineStore("viewer", () => {
  const router = useRouter();
  // State
  const bookId = ref<number | null>(null);
  const filterParams = ref<FilterParams | null>(null);
  const bookTitle = ref<string | null>(null);
  const is_favorite = ref(false);
  const pagePaths = ref<string[]>([]);
  const currentPage = ref(1);
  const totalPages = ref(0);
  const readingMode = ref<"ltr" | "rtl" | "webtoon">("ltr");
  const viewerDoublePageView = ref(false);
  const viewerShowCoverAlone = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const viewerRestoreLastSession = ref(true);
  const viewerAutoFitZoom = ref(true);
  const images = ref<HTMLElement[] | null>(null);

  // Zoom state
  const zoomLevel = ref(100); // 10 ~ 500
  const panX = ref(0);
  const panY = ref(0);

  // Auto-play state
  const isAutoPlay = ref(false);
  const autoPlayInterval = ref(5); // seconds
  const autoPlayTimer = ref<NodeJS.Timeout | null>(null);

  // Auto-next-book state
  const isAutoNextBook = ref(false);
  const autoNextBookMode = ref<"next" | "random">("next");

  // Toast state
  const showToast = ref(false);
  const toastMessage = ref("");
  const toastTimeoutId = ref<NodeJS.Timeout | null>(null);

  // Getters
  const currentImageUrl = computed<string | null>(() => {
    if (viewerDoublePageView.value && readingMode.value !== "webtoon")
      return null;
    if (pagePaths.value.length > 0 && currentPage.value > 0) {
      return pagePaths.value[currentPage.value - 1];
    }
    return null;
  });

  const leftPage = computed(() => {
    if (!viewerDoublePageView.value || readingMode.value === "webtoon")
      return null;
    if (readingMode.value === "ltr") {
      if (viewerShowCoverAlone.value && currentPage.value === 1) return null;
      return currentPage.value;
    } else {
      // rtl
      if (viewerShowCoverAlone.value && currentPage.value === 1) return null;
      return currentPage.value + 1;
    }
  });

  const rightPage = computed(() => {
    if (!viewerDoublePageView.value || readingMode.value === "webtoon")
      return null;
    if (readingMode.value === "ltr") {
      if (viewerShowCoverAlone.value && currentPage.value === 1) return 1;
      return currentPage.value + 1;
    } else {
      // rtl
      if (viewerShowCoverAlone.value && currentPage.value === 1) return 1;
      return currentPage.value;
    }
  });

  const leftPageUrl = computed(() => {
    const pageNum = leftPage.value;
    if (!pageNum || pageNum > totalPages.value || !pagePaths.value[pageNum - 1])
      return null;
    return pagePaths.value[pageNum - 1];
  });

  const rightPageUrl = computed(() => {
    const pageNum = rightPage.value;
    if (!pageNum || pageNum > totalPages.value || !pagePaths.value[pageNum - 1])
      return null;
    return pagePaths.value[pageNum - 1];
  });

  // Actions
  function showToastMessage(message: string, duration = 1000) {
    if (toastTimeoutId.value) {
      clearTimeout(toastTimeoutId.value);
    }
    toastMessage.value = message;
    showToast.value = true;
    toastTimeoutId.value = setTimeout(() => {
      showToast.value = false;
      toastMessage.value = "";
    }, duration);
  }

  function _stopAutoPlayCore() {
    if (autoPlayTimer.value) {
      clearInterval(autoPlayTimer.value);
      autoPlayTimer.value = null;
    }
    isAutoPlay.value = false;
  }

  function stopAutoPlay() {
    if (isAutoPlay.value) {
      _stopAutoPlayCore();
      showToastMessage("자동 넘김이 중지되었습니다.");
    }
  }

  function _startAutoPlayCore() {
    _stopAutoPlayCore(); // 기존 타이머 제거
    isAutoPlay.value = true;
    autoPlayTimer.value = setInterval(() => {
      nextPage();
    }, autoPlayInterval.value * 1000);
  }

  function startAutoPlay() {
    _startAutoPlayCore();
    showToastMessage(
      `자동 넘김이 시작되었습니다. (${autoPlayInterval.value}초 간격)`,
    );
  }
  async function updateCurrentPageInDb() {
    if (bookId.value && currentPage.value) {
      await ipcRenderer.invoke("update-book-current-page", {
        bookId: bookId.value,
        currentPage: currentPage.value,
      });
    }
  }

  async function loadNextBook(
    explicitMode?: "next" | "random", // Optional parameter for explicit mode
  ) {
    if (!bookId.value) return;

    // Determine the mode to use: explicitMode if provided, otherwise autoNextBookMode.value
    const modeToUse = explicitMode || autoNextBookMode.value;

    const result = await ipcRenderer.invoke("get-next-book", {
      currentBookId: bookId.value,
      mode: modeToUse, // Use the determined mode
      filter: toRaw(filterParams.value),
    });

    if (result.success && result.nextBookId) {
      showToastMessage(
        `${modeToUse === "next" ? "다음" : "랜덤"} 책을 불러옵니다: ${
          result.nextBookTitle || ""
        }`,
      );
      await loadBook(result.nextBookId, filterParams.value ?? undefined);
    } else {
      showToastMessage("마지막 책입니다.");
      stopAutoPlay();
    }
  }

  async function loadPrevBook() {
    if (!bookId.value) return;

    const result = await ipcRenderer.invoke("get-prev-book", {
      currentBookId: bookId.value,
      filter: toRaw(filterParams.value),
    });

    if (result.success && result.prevBookId) {
      showToastMessage(`이전 책을 불러옵니다: ${result.prevBookTitle || ""}`);
      await loadBook(result.prevBookId, filterParams.value ?? undefined);
    } else {
      showToastMessage("첫 번째 책입니다.");
      stopAutoPlay();
    }
  }

  function goToPage(page: number) {
    if (page < 1 || page > totalPages.value) return;

    let targetPage = page;
    if (viewerDoublePageView.value && readingMode.value !== "webtoon") {
      if (viewerShowCoverAlone.value) {
        // 표지(1p)를 제외한 나머지 페이지(2p~)는 짝수 페이지로 정렬
        if (targetPage > 1 && targetPage % 2 === 1) {
          targetPage -= 1;
        }
      } else {
        // 모든 페이지를 홀수 페이지로 정렬
        if (targetPage % 2 === 0) {
          targetPage -= 1;
        }
      }
    }

    currentPage.value = Math.max(1, targetPage);
    router.replace({ query: { page: currentPage.value.toString() } });

    if (readingMode.value === "webtoon" && images.value) {
      const imageEl = images.value.find(
        (el) => Number(el.getAttribute("data-page-num")) === currentPage.value,
      );

      nextTick(() => {
        imageEl?.scrollIntoView({ behavior: "instant", block: "start" });
      });
    }
  }

  function nextPage() {
    const isDouble =
      viewerDoublePageView.value && readingMode.value !== "webtoon";
    let increment = isDouble ? 2 : 1;

    // 더블 페이지 + 표지 따로 보기 모드에서, 현재 표지(1p)에 있다면 다음은 2p로 이동
    if (isDouble && viewerShowCoverAlone.value && currentPage.value === 1) {
      increment = 1;
    }

    const newPage = currentPage.value + increment;

    if (newPage <= totalPages.value) {
      goToPage(newPage);
    } else if (currentPage.value < totalPages.value) {
      // 마지막 페이지를 넘어가지 않도록 처리
      goToPage(totalPages.value);
    } else if (isAutoNextBook.value) {
      loadNextBook();
    } else {
      showToastMessage("마지막 페이지입니다.");
    }
  }

  function prevPage() {
    const isDouble =
      viewerDoublePageView.value && readingMode.value !== "webtoon";
    let decrement = isDouble ? 2 : 1;

    // 더블 페이지 + 표지 따로 보기 모드에서, 현재 첫 펼침(2p)에 있다면 이전은 표지(1p)로 이동
    if (isDouble && viewerShowCoverAlone.value && currentPage.value === 2) {
      decrement = 1;
    }

    if (currentPage.value === 1) {
      showToastMessage("첫번째 페이지입니다.");
    }
    goToPage(Math.max(1, currentPage.value - decrement));
  }

  function setReadingMode(mode: "ltr" | "rtl" | "webtoon") {
    readingMode.value = mode;
    ipcRenderer.invoke("set-config", { key: "viewerReadingMode", value: mode });
    // When switching to webtoon, disable double page
    if (mode === "webtoon" && viewerDoublePageView.value) {
      viewerDoublePageView.value = false;
      showToastMessage("웹툰 모드에서는 더블 페이지가 비활성화됩니다.");
    }
  }

  function toggleAutoPlay() {
    if (isAutoPlay.value) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  }

  function setAutoPlayInterval(interval: number) {
    autoPlayInterval.value = interval;
    if (isAutoPlay.value) {
      // 자동 넘김이 실행중이면, 간격을 변경하여 다시 시작
      _startAutoPlayCore(); // 시작 토스트 없이 재시작
    }
    showToastMessage(`자동 넘김 간격이 ${interval}초로 변경되었습니다.`);
    ipcRenderer.invoke("set-config", {
      key: "viewerAutoPlayInterval",
      value: interval,
    });
  }

  function startAutoPlayWithInterval(seconds: number) {
    autoPlayInterval.value = seconds; // 간격 설정
    if (!isAutoPlay.value) {
      startAutoPlay(); // 자동 넘김이 시작되지 않은 상태였다면 시작 토스트와 함께 시작
    } else {
      _startAutoPlayCore(); // 이미 실행 중이었다면 시작 토스트 없이 재시작
      showToastMessage(`자동 넘김 간격이 ${seconds}초로 변경되었습니다.`); // 간격 변경 토스트
    }
  }

  function toggleAutoNextBook() {
    isAutoNextBook.value = !isAutoNextBook.value;
    const status = isAutoNextBook.value ? "활성화" : "비활성화";
    showToastMessage(`다음 책 자동 넘김이 ${status}되었습니다.`);
    ipcRenderer.invoke("set-config", {
      key: "viewerAutoNextBook",
      value: isAutoNextBook.value,
    });
  }

  function setNextBookMode(mode: "next" | "random") {
    autoNextBookMode.value = mode;
    const modeText = mode === "next" ? "다음 순서" : "랜덤";
    showToastMessage(`다음 책 넘김 모드가 ${modeText}로 변경되었습니다.`);
    ipcRenderer.invoke("set-config", {
      key: "viewerAutoNextBookMode",
      value: mode,
    });
  }

  function setDoublePage(value: boolean) {
    if (readingMode.value === "webtoon" && value) {
      showToastMessage("웹툰 모드에서는 더블 페이지를 사용할 수 없습니다.");
      viewerDoublePageView.value = false;
      return;
    }
    viewerDoublePageView.value = value;
    const status = value ? "활성화" : "비활성화";
    showToastMessage(`더블 페이지 모드가 ${status}되었습니다.`);
    ipcRenderer.invoke("set-config", { key: "viewerDoublePageView", value });
    // Adjust current page to be the start of a spread
    goToPage(currentPage.value);
  }

  function setShowCoverAlone(value: boolean) {
    viewerShowCoverAlone.value = value;
    const status = value ? "활성화" : "비활성화";
    showToastMessage(`표지 따로 보기가 ${status}되었습니다.`);
    ipcRenderer.invoke("set-config", { key: "viewerShowCoverAlone", value });
    // Adjust current page to be the start of a spread
    goToPage(currentPage.value);
  }

  function setViewerAutoFitZoom(value: boolean) {
    viewerAutoFitZoom.value = value;
    const status = value ? "활성화" : "비활성화";
    showToastMessage(`자동 맞춤 확대가 ${status}되었습니다.`);
    ipcRenderer.invoke("set-config", { key: "viewerAutoFitZoom", value });
  }

  function setViewerRestoreLastSession(value: boolean) {
    viewerRestoreLastSession.value = value;
    const status = value ? "활성화" : "비활성화";
    showToastMessage(`마지막 세션 복원이 ${status}되었습니다.`);
    ipcRenderer.invoke("set-config", {
      key: "viewerRestoreLastSession",
      value,
    });
  }

  function zoomIn() {
    if (readingMode.value === "webtoon") return;
    const newZoom = Math.min(500, zoomLevel.value + 10);
    zoomLevel.value = newZoom;
    showToastMessage(`확대: ${newZoom}%`);
  }

  function zoomOut() {
    if (readingMode.value === "webtoon") return;
    const newZoom = Math.max(10, zoomLevel.value - 10);
    zoomLevel.value = newZoom;
    showToastMessage(`축소: ${newZoom}%`);
  }

  function resetZoom() {
    if (readingMode.value === "webtoon") return;
    zoomLevel.value = 100;
    panX.value = 0;
    panY.value = 0;
    showToastMessage("확대/축소 초기화");
  }

  function setZoom(level: number) {
    if (readingMode.value === "webtoon") return;
    zoomLevel.value = Math.max(10, Math.min(500, level));
  }

  function setPan(x: number, y: number) {
    panX.value = x;
    panY.value = y;
  }

  function cleanup() {
    _stopAutoPlayCore();
    bookId.value = null;
    bookTitle.value = null;
    pagePaths.value = [];
    currentPage.value = 1;
    totalPages.value = 0;
    readingMode.value = "ltr";
    loading.value = false;
    error.value = null;
    isAutoPlay.value = false;
    isAutoNextBook.value = false;
    autoNextBookMode.value = "next";
    is_favorite.value = false; // 즐겨찾기 상태 초기화
    viewerDoublePageView.value = false;
    viewerShowCoverAlone.value = true;
    zoomLevel.value = 100; // 줌 레벨 초기화
    panX.value = 0; // 팬 X 초기화
    panY.value = 0; // 팬 Y 초기화
    if (toastTimeoutId.value) {
      clearTimeout(toastTimeoutId.value);
    }
    showToast.value = false;
    toastMessage.value = "";
    images.value = null;
  }

  async function loadViewerSettings() {
    const config = await ipcRenderer.invoke("get-config");
    if (config.viewerAutoPlayInterval !== undefined) {
      autoPlayInterval.value = config.viewerAutoPlayInterval;
    }
    if (config.viewerAutoNextBook !== undefined) {
      isAutoNextBook.value = config.viewerAutoNextBook;
    }
    if (config.viewerAutoNextBookMode !== undefined) {
      autoNextBookMode.value = config.viewerAutoNextBookMode;
    }
    if (config.viewerRestoreLastSession !== undefined) {
      viewerRestoreLastSession.value = config.viewerRestoreLastSession;
    }
    if (config.viewerAutoFitZoom !== undefined) {
      viewerAutoFitZoom.value = config.viewerAutoFitZoom;
    }
    if (config.viewerDoublePageView !== undefined) {
      viewerDoublePageView.value = config.viewerDoublePageView;
    }
    if (config.viewerShowCoverAlone !== undefined) {
      viewerShowCoverAlone.value = config.viewerShowCoverAlone;
    }
    if (config.viewerReadingMode !== undefined) {
      readingMode.value = config.viewerReadingMode;
    }
  }

  async function loadBook(_bookId: number, _filterParams?: FilterParams) {
    if (bookId.value === _bookId && pagePaths.value.length > 0) {
      return;
    }

    const query: Record<string, string> = {};
    if (_filterParams) {
      query.filter = JSON.stringify(_filterParams);
    }
    router.replace({ path: `/viewer/${_bookId}`, query });

    const wasAutoPlaying = isAutoPlay.value; // 현재 자동 넘김 상태 저장
    _stopAutoPlayCore(); // 토스트 메시지 없이 자동 넘김 중지

    loading.value = true;
    error.value = null;
    bookId.value = _bookId;
    if (_filterParams) {
      filterParams.value = _filterParams;
    }

    try {
      const pathResult = await ipcRenderer.invoke(
        "get-book-page-paths",
        _bookId,
      );
      if (pathResult.success) {
        pagePaths.value = pathResult.data;
        totalPages.value = pagePaths.value.length;
        bookTitle.value = pathResult.title;
        is_favorite.value = !!pathResult.is_favorite; // 즐겨찾기 상태 업데이트
      } else {
        throw new Error(pathResult.error);
      }

      if (viewerRestoreLastSession.value) {
        const pageResult = await ipcRenderer.invoke(
          "get-book-current-page",
          _bookId,
        );
        if (pageResult.success && pageResult.currentPage > 1) {
          goToPage(pageResult.currentPage);
        } else {
          currentPage.value = 1;
        }
      } else {
        currentPage.value = 1;
      }
      // 책 로드 후 현재 페이지를 DB에 업데이트하여 마지막 읽은 날짜를 갱신
      await updateCurrentPageInDb();
    } catch (e) {
      error.value = (e as Error).message || "Failed to load book.";
      console.error(error.value);
      showToastMessage(`책을 불러오는 데 실패했습니다: ${error.value!}`, 5000);
    } finally {
      loading.value = false;
      if (wasAutoPlaying) {
        _startAutoPlayCore(); // 이전에 자동 넘김 중이었다면 다시 시작 (토스트 메시지 없이)
      }
    }
  }

  async function toggleFavorite() {
    if (bookId.value === null) return;

    const newFavoriteStatus = !is_favorite.value; // 토글될 새로운 상태
    const result = await ipcRenderer.invoke(
      "toggle-book-favorite",
      bookId.value,
      newFavoriteStatus,
    );
    if (result.success) {
      is_favorite.value = !!result.is_favorite; // 메인 프로세스에서 반환된 실제 상태로 UI 업데이트
      showToastMessage(
        `이 책이 ${newFavoriteStatus ? "즐겨찾기에 추가" : "즐겨찾기에서 제거"}되었습니다.`, // newFavoriteStatus 사용
      );
    } else {
      showToastMessage(
        `즐겨찾기 상태 변경에 실패했습니다: ${result.error}`,
        5000,
      );
    }
  }

  watchDebounced(
    currentPage,
    () => {
      updateCurrentPageInDb();
    },
    { debounce: 500 },
  );

  watch(bookTitle, (newTitle) => {
    if (newTitle) {
      setWindowTitle(newTitle);
    } else {
      setWindowTitle("동인메뉴판");
    }
  });

  watch(currentPage, () => {
    if (isAutoPlay.value) {
      _startAutoPlayCore();
    }
    // 페이지 변경 시 줌 레벨 및 팬 위치 초기화
    zoomLevel.value = 100;
    panX.value = 0;
    panY.value = 0;
  });

  return {
    bookId,
    bookTitle,
    pagePaths,
    currentPage,
    totalPages,
    readingMode,
    loading,
    error,
    currentImageUrl,
    isAutoPlay,
    autoPlayInterval,
    isAutoNextBook,
    autoNextBookMode,
    loadBook,
    nextPage,
    prevPage,
    goToPage,
    setReadingMode,
    toggleAutoPlay,
    setAutoPlayInterval,
    startAutoPlayWithInterval,
    stopAutoPlay,
    toggleAutoNextBook,
    setNextBookMode,
    loadNextBook,
    loadPrevBook,
    cleanup,
    loadViewerSettings,
    viewerRestoreLastSession,
    viewerAutoFitZoom,
    is_favorite,
    toggleFavorite,
    viewerDoublePageView,
    viewerShowCoverAlone,
    leftPageUrl,
    rightPageUrl,
    setDoublePage,
    setShowCoverAlone,
    setViewerAutoFitZoom,
    setViewerRestoreLastSession,
    showToast,
    toastMessage,
    showToastMessage,
    images,
    zoomLevel,
    panX,
    panY,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    setPan,
  };
});
