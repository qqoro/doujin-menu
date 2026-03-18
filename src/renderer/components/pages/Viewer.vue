<script setup lang="ts">
import {
  addBookHistory,
  isNewWindow as apiIsNewWindow,
  closeCurrentWindow,
  deleteBook,
  getBook,
  ipcRenderer,
  openWithExternalProgram,
} from "@/api";
import BookDetailDialog from "@/components/feature/BookDetailDialog.vue";
import ViewerHelpDialog from "@/components/feature/viewer/ViewerHelpDialog.vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useKeybindings } from "@/composable/useKeybindings";
import { useWindowEvent } from "@/composable/useWindowEvent";
import { useUiStore } from "@/store/uiStore";
import { useViewerStore } from "@/store/viewerStore";
import { Icon } from "@iconify/vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useThrottleFn } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const store = useViewerStore();
const uiStore = useUiStore();
const queryClient = useQueryClient();

const isNewWindow = ref(false);

// 히스토리 추가 대기 상태 (페이지를 실제로 봤을 때만 기록하기 위함)
const pendingHistoryBookId = ref<number | null>(null);

const {
  bookId,
  currentPage,
  totalPages,
  currentImageUrl,
  loading,
  error,
  readingMode,
  pagePaths,
  bookTitle,
  isAutoPlay,
  autoPlayInterval,
  isAutoNextBook,
  autoNextBookMode,
  autoPlayStopPage,
  viewerAutoFitZoom,
  is_favorite,
  viewerDoublePageView,
  viewerShowCoverAlone,
  leftPageUrl,
  rightPageUrl,
  showToast,
  toastMessage,
  images,
  zoomLevel,
  panX,
  panY,
  viewerHideNavigationOverlay,
  hidePageNumber,
  viewerHideToast,
} = storeToRefs(store);

const { screenRotation } = storeToRefs(uiStore);

const { data: book } = useQuery({
  queryKey: [bookId, is_favorite],
  enabled: () => !!bookId.value,
  queryFn: () => getBook(bookId.value!),
});

// 시리즈 총 권수 조회
const { data: seriesBooks } = useQuery({
  queryKey: computed(() => ["seriesBooks", book.value?.series_collection_id]),
  enabled: computed(() => !!book.value?.series_collection_id),
  queryFn: async () => {
    if (!book.value?.series_collection_id) return [];
    const result = await ipcRenderer.invoke(
      "get-series-books",
      book.value.series_collection_id,
    );
    return result.success ? result.data || [] : [];
  },
});

const seriesTotalCount = computed(() => seriesBooks.value?.length || 0);

// 시리즈 내에서의 실제 순서 (1부터 시작)
const seriesCurrentIndex = computed(() => {
  if (!book.value?.series_collection_id || !seriesBooks.value) return null;
  const sortedBooks = [...seriesBooks.value].sort(
    (a, b) => (a.series_order_index || 0) - (b.series_order_index || 0),
  );
  const currentIndex = sortedBooks.findIndex((b) => b.id === book.value?.id);
  return currentIndex >= 0 ? currentIndex + 1 : null;
});

const imageClasses = computed(() => {
  if (viewerAutoFitZoom.value) {
    return "w-full h-full object-contain";
  } else {
    return "max-w-full max-h-full object-contain";
  }
});

const doublePageImageClasses = computed(() => {
  if (viewerAutoFitZoom.value && currentPage.value === 1) {
    return "h-full object-contain";
  } else if (viewerAutoFitZoom.value) {
    return "max-w-1/2 h-full object-contain";
  } else {
    return "max-w-1/2 max-h-full object-contain";
  }
});

const imageStyle = computed(() => {
  if (readingMode.value === "webtoon") return {};

  let cursor = "default";
  if (!showCursor.value) {
    cursor = "none";
  } else if (zoomLevel.value > 100) {
    cursor = isDragging.value ? "grabbing" : "grab";
  }

  return {
    transform: `scale(${zoomLevel.value / 100}) translate(${panX.value}px, ${panY.value}px)`,
    cursor,
  };
});

// 화면 회전 스타일 계산
const rotationStyle = computed(() => {
  const rotation = screenRotation.value;
  if (rotation === 0) return {};

  if (rotation === 90 || rotation === 270) {
    // 90도/270도 회전 시 width/height 교체 필요
    return {
      transform: `rotate(${rotation}deg)`,
      transformOrigin: "center center",
      width: "100vh",
      height: "100vw",
      position: "fixed" as const,
      top: "50%",
      left: "50%",
      marginLeft: "-50vh",
      marginTop: "-50vw",
    };
  }

  // 180도 회전
  return {
    transform: "rotate(180deg)",
    transformOrigin: "center center",
  };
});

const viewerArea = ref<HTMLElement | null>(null);
const screenRef = ref<HTMLElement | null>(null);
const webtoonRef = ref<HTMLElement | null>(null);
const webtoonImageRef = ref<HTMLElement[] | null>(null);

const showCursor = ref(true);
const showControls = ref(true);
const openSetting = ref(false);
const isHelpOpen = ref(false);
const isDetailOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const externalProgramPath = ref("");

// 이미지 드래그 상태
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const dragStartPanX = ref(0);
const dragStartPanY = ref(0);

let cursorHideTimer: ReturnType<typeof setTimeout> | null = null;
const handleMouseMove = (e: MouseEvent) => {
  showCursor.value = true;
  if (cursorHideTimer !== null) {
    clearTimeout(cursorHideTimer);
  }
  cursorHideTimer = setTimeout(() => {
    showCursor.value = false;
  }, 3000);

  showControls.value = true;
  const mouseY = e.clientY;
  const threshold = Math.max(60, window.innerHeight * 0.15); // 상단/하단 15% 임계값 + 최소값 60px

  if (
    mouseY < threshold ||
    mouseY > window.innerHeight - threshold ||
    openSetting.value ||
    isHelpOpen.value
  ) {
    showControls.value = true;
    return;
  }
  showControls.value = false;
};

// 외부 프로그램으로 현재 페이지 열기
const openInExternalProgram = async () => {
  if (!book.value || !externalProgramPath.value) return;
  try {
    await openWithExternalProgram(book.value.id, currentPage.value - 1);
  } catch (error) {
    store.showToastMessage((error as Error).message);
  }
};

const handleDeleteBook = async () => {
  if (!bookId.value) return;

  try {
    const currentBookId = bookId.value;
    await deleteBook(currentBookId);
    isDeleteDialogOpen.value = false;

    // 라이브러리 목록 쿼리 무효화
    queryClient.invalidateQueries({ queryKey: ["books"] });

    // route에서 filter 가져오기
    const filter = route.query.filter;
    let filterParams;
    if (filter && typeof filter === "string") {
      try {
        filterParams = JSON.parse(filter);
      } catch (e) {
        console.error("Failed to parse filter from route", e);
      }
    }

    // 다음 책으로 이동 시도
    const result = await ipcRenderer.invoke("get-next-book", {
      currentBookId,
      mode: "next",
      filter: filterParams,
    });

    // 다음 책이 있으면 이동, 없으면 뒤로 가기
    if (result.success && result.nextBookId) {
      await store.loadBook(result.nextBookId, filterParams);
    } else {
      if (isNewWindow.value) {
        closeCurrentWindow();
      } else {
        router.back();
      }
    }
  } catch (error) {
    console.error("책 삭제 중 오류 발생:", error);
  }
};

const handleWheel = (e: WheelEvent) => {
  // Ctrl + 휠로 확대/축소 (모든 모드에서 동작)
  if (e.ctrlKey) {
    e.preventDefault();
    if (e.deltaY < 0) {
      store.zoomIn();
    } else if (e.deltaY > 0) {
      store.zoomOut();
    }
    return;
  }

  // 웹툰 모드에서는 기본 스크롤 유지
  if (readingMode.value === "webtoon") return;

  // 기본 휠 동작: 페이지 이동 (웹툰 모드 제외)
  if (e.deltaY > 0) {
    store.nextPage();
  } else if (e.deltaY < 0) {
    store.prevPage();
  }
};

const handleMouseUp = (e: MouseEvent) => {
  if (e.button === 1) {
    // 휠 클릭
    ipcRenderer.send("fullscreen-toggle-window");
  }
  // 드래그 종료
  if (e.button === 0) {
    isDragging.value = false;
  }
};

const handleMouseDown = (e: MouseEvent) => {
  // 이미지가 확대되어 있고, 왼쪽 클릭인 경우에만 드래그 시작
  if (e.button === 0 && zoomLevel.value > 100) {
    e.preventDefault();
    isDragging.value = true;
    dragStartX.value = e.clientX;
    dragStartY.value = e.clientY;
    dragStartPanX.value = panX.value;
    dragStartPanY.value = panY.value;
  }
};

const handleMouseMoveForDrag = (e: MouseEvent) => {
  if (!isDragging.value) return;

  const deltaX = e.clientX - dragStartX.value;
  const deltaY = e.clientY - dragStartY.value;

  if (readingMode.value === "webtoon" && webtoonRef.value) {
    // 웹툰 모드: 스크롤 위치 조정
    webtoonRef.value.scrollLeft = webtoonRef.value.scrollLeft - deltaX;
    webtoonRef.value.scrollTop = webtoonRef.value.scrollTop - deltaY;
    dragStartX.value = e.clientX;
    dragStartY.value = e.clientY;
  } else {
    // 일반 모드: transform 패닝
    store.setPan(dragStartPanX.value + deltaX, dragStartPanY.value + deltaY);
  }
};

// 웹툰 모드 스크롤 위치 추적 및 페이지 업데이트
const handleScroll = useThrottleFn(
  () => {
    if (
      readingMode.value !== "webtoon" ||
      !webtoonRef.value ||
      !webtoonImageRef.value
    )
      return;

    const scrollTop = webtoonRef.value.scrollTop;
    const images = webtoonImageRef.value;
    let newCurrentPage = 1;

    for (const img of images) {
      if (
        img.offsetTop <= scrollTop + 10 &&
        img.offsetTop + img.offsetHeight > scrollTop
      ) {
        newCurrentPage = Number(img.getAttribute("data-page-num"));
        break;
      }
    }

    // Edge case: if scrolled to the very bottom, ensure last page is shown
    if (
      scrollTop + webtoonRef.value.clientHeight >=
      webtoonRef.value.scrollHeight - 5
    ) {
      // -5 for a small buffer
      newCurrentPage = totalPages.value;
    }

    if (store.currentPage !== newCurrentPage) {
      store.currentPage = newCurrentPage;
    }
  },
  500,
  true,
);

watch(webtoonImageRef, (newRef) => {
  images.value = newRef;
});

// bookId 변경 감지 (책이 로드될 때)
watch(bookId, (newBookId) => {
  if (newBookId) {
    // 히스토리 추가를 대기 상태로 설정 (페이지를 실제로 볼 때까지)
    pendingHistoryBookId.value = newBookId;
  }
});

// currentPage 변경 감지 (실제로 페이지를 봤을 때)
watch(currentPage, () => {
  if (pendingHistoryBookId.value) {
    // 페이지를 봤으므로 히스토리 기록
    addBookHistory(pendingHistoryBookId.value);
    pendingHistoryBookId.value = null; // 한 번만 호출되도록 초기화
  }
});

onMounted(async () => {
  isNewWindow.value = await apiIsNewWindow();
  store.loadViewerSettings();
  const bookId = Number(route.params.id);
  const filter = route.query.filter;

  let filterParams;
  if (filter && typeof filter === "string") {
    try {
      filterParams = JSON.parse(filter);
    } catch (e) {
      console.error("Failed to parse filter from route", e);
    }
  }

  if (bookId) {
    store.loadBook(bookId, filterParams);
    // 초기 로드 시에도 대기 상태로 설정 (페이지가 로드되면 자동으로 기록됨)
    pendingHistoryBookId.value = bookId;
  }

  // 뷰어 진입 시 전체 화면 설정 확인
  const config = await ipcRenderer.invoke("get-config");
  if (config.viewerOpenInFullscreen === true) {
    ipcRenderer.send("set-fullscreen-window", true);
  }
  externalProgramPath.value = (config.externalProgramPath as string) || "";

  // 뷰어 진입 시 초기 타이머 설정 (마우스 움직임 없으면 3초 후 컨트롤 숨김)
  cursorHideTimer = setTimeout(() => {
    showCursor.value = false;
    showControls.value = false;
  }, 3000);
});

// webtoonRef 변경 시 store에 동기화
watch(
  webtoonRef,
  (newRef) => {
    store.webtoonScrollRef = newRef;
  },
  { immediate: true },
);

onUnmounted(() => {
  store.cleanup();
  store.webtoonScrollRef = null; // ref 제거
  ipcRenderer.send("set-fullscreen-window", false);
  if (cursorHideTimer !== null) {
    clearTimeout(cursorHideTimer);
  }
});

useWindowEvent("mousemove", (e) => {
  handleMouseMove(e);
  handleMouseMoveForDrag(e);
});
useWindowEvent("wheel", useThrottleFn(handleWheel, 100, true));
useWindowEvent("mouseup", handleMouseUp);
useWindowEvent("mousedown", handleMouseDown);

// 뷰어 단축키 등록
useKeybindings(
  "viewer",
  {
    "viewer:fullscreen": () => {
      ipcRenderer.send("fullscreen-toggle-window");
    },
    "viewer:escape": () => {
      // hasOpenDialog() 가드는 composable에서 처리
      if (isNewWindow.value) {
        closeCurrentWindow();
      } else {
        router.back();
      }
    },
    "viewer:delete-book": () => {
      isDeleteDialogOpen.value = true;
    },
    "viewer:maximize-toggle": () => {
      ipcRenderer.send("maximize-toggle-window");
    },
    "viewer:random-book": () => {
      store.loadNextBook("random");
    },
    "viewer:toggle-auto-next": () => {
      store.toggleAutoNextBook();
    },
    "viewer:zoom-in": () => {
      store.zoomIn();
    },
    "viewer:zoom-out": () => {
      store.zoomOut();
    },
    "viewer:zoom-reset": (e) => {
      if (e.ctrlKey) return; // Ctrl+0은 auto-flip-stop
      store.resetZoom();
    },
    "viewer:auto-flip-1": () => {
      store.startAutoPlayWithInterval(1);
    },
    "viewer:auto-flip-2": () => {
      store.startAutoPlayWithInterval(2);
    },
    "viewer:auto-flip-3": () => {
      store.startAutoPlayWithInterval(3);
    },
    "viewer:auto-flip-4": () => {
      store.startAutoPlayWithInterval(4);
    },
    "viewer:auto-flip-5": () => {
      store.startAutoPlayWithInterval(5);
    },
    "viewer:auto-flip-6": () => {
      store.startAutoPlayWithInterval(6);
    },
    "viewer:auto-flip-7": () => {
      store.startAutoPlayWithInterval(7);
    },
    "viewer:auto-flip-8": () => {
      store.startAutoPlayWithInterval(8);
    },
    "viewer:auto-flip-9": () => {
      store.startAutoPlayWithInterval(9);
    },
    "viewer:auto-flip-stop": () => {
      store.stopAutoPlay();
    },
    "viewer:first-page": () => {
      store.goToPage(1); // 1-based
    },
    "viewer:last-page": () => {
      store.goToPage(totalPages.value); // 1-based
    },
    "viewer:prev-book": () => {
      store.loadPrevBook();
    },
    "viewer:next-book": () => {
      store.loadNextBook("next");
    },
    "viewer:prev-series": () => {
      store.loadPrevBookInSeries();
    },
    "viewer:next-series": () => {
      store.loadNextBookInSeries();
    },
    "viewer:book-info": () => {
      isDetailOpen.value = !isDetailOpen.value;
    },
    "viewer:next-page": (e) => {
      // 웹툰 모드에서 ArrowDown/PageDown은 스크롤만 (페이지 이동 안함)
      if (
        store.readingMode === "webtoon" &&
        ["ArrowDown", "PageDown"].includes(e.key)
      )
        return;
      store.nextPage();
    },
    "viewer:prev-page": (e) => {
      // 웹툰 모드에서 ArrowUp/PageUp은 스크롤만 (페이지 이동 안함)
      if (
        store.readingMode === "webtoon" &&
        ["ArrowUp", "PageUp"].includes(e.key)
      )
        return;
      store.prevPage();
    },
  },
  { throttle: 100 },
);
</script>

<template>
  <div
    ref="screenRef"
    class="flex flex-col"
    :class="{
      'cursor-none!': !showCursor,
      'h-full': screenRotation === 90 || screenRotation === 270,
      'h-screen': screenRotation !== 90 && screenRotation !== 270,
    }"
    :style="rotationStyle"
  >
    <!-- 헤더 -->
    <Transition name="fade">
      <div
        v-if="showControls"
        class="bg-muted-foreground/50 fixed top-0 right-0 left-0 z-50 p-4 transition-opacity duration-300"
        style="-webkit-app-region: drag"
      >
        <TooltipProvider>
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    style="-webkit-app-region: no-drag"
                    @click="isNewWindow ? closeCurrentWindow() : router.back()"
                  >
                    <Icon
                      icon="solar:alt-arrow-left-line-duotone"
                      class="size-6"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p v-if="isNewWindow" class="flex items-center gap-1">
                    창 닫기 <kbd>Esc</kbd>
                  </p>
                  <p v-else class="flex items-center gap-1">
                    라이브러리로 돌아가기 <kbd>Esc</kbd>
                  </p>
                </TooltipContent>
              </Tooltip>
              <h1 class="truncate text-xl font-bold">
                {{ bookTitle || "만화책 뷰어" }}
              </h1>
            </div>
            <div class="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    style="-webkit-app-region: no-drag"
                    @click="store.loadPrevBook()"
                  >
                    <Icon
                      icon="solar:rewind-back-bold-duotone"
                      class="h-6 w-6"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p class="flex items-center gap-1">이전 책 <kbd>[</kbd></p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    style="-webkit-app-region: no-drag"
                    @click="store.toggleAutoPlay"
                  >
                    <Icon
                      :icon="
                        isAutoPlay
                          ? 'solar:pause-bold-duotone'
                          : 'solar:play-bold-duotone'
                      "
                      class="h-6 w-6"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div class="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span>자동 재생</span>
                    <div class="flex items-center gap-1">
                      <kbd>Ctrl</kbd>+<kbd>1-9</kbd>
                    </div>
                    <span>정지</span>
                    <div class="flex items-center gap-1">
                      <kbd>Ctrl</kbd>+<kbd>0</kbd>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    style="-webkit-app-region: no-drag"
                    @click="store.loadNextBook()"
                  >
                    <Icon
                      icon="solar:rewind-forward-bold-duotone"
                      class="h-6 w-6"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p class="flex items-center gap-1">다음 책 <kbd>]</kbd></p>
                </TooltipContent>
              </Tooltip>
              <!-- 랜덤 책 버튼 -->
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    style="-webkit-app-region: no-drag"
                    @click="store.loadNextBook('random')"
                  >
                    <Icon icon="solar:shuffle-bold-duotone" class="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p class="flex items-center gap-1">랜덤 책 <kbd>\</kbd></p>
                </TooltipContent>
              </Tooltip>
              <!-- 시리즈 네비게이션 버튼 -->
              <div
                v-if="book?.series_collection_id"
                class="border-muted-foreground/30 ml-2 flex items-center gap-1 border-l pl-2"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      style="-webkit-app-region: no-drag"
                      @click="store.loadPrevBookInSeries()"
                    >
                      <Icon
                        icon="solar:skip-previous-bold-duotone"
                        class="h-6 w-6"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p class="flex items-center gap-1">
                      시리즈 이전 권 <kbd>Shift</kbd>+<kbd>[</kbd>
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      style="-webkit-app-region: no-drag"
                      @click="store.loadNextBookInSeries()"
                    >
                      <Icon
                        icon="solar:skip-next-bold-duotone"
                        class="h-6 w-6"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p class="flex items-center gap-1">
                      시리즈 다음 권 <kbd>Shift</kbd>+<kbd>]</kbd>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    style="-webkit-app-region: no-drag"
                    @click="store.toggleFavorite()"
                  >
                    <Icon
                      :icon="
                        is_favorite
                          ? 'solar:star-bold-duotone'
                          : 'solar:star-outline'
                      "
                      class="h-6 w-6"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>즐겨찾기</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>
    </Transition>

    <!-- 뷰어 영역 -->
    <div
      ref="viewerArea"
      class="relative flex flex-1 items-center justify-center overflow-auto"
    >
      <div
        v-if="readingMode !== 'webtoon'"
        class="pointer-events-auto absolute top-0 left-0 z-10 flex w-1/4 max-w-[500px] cursor-pointer items-center justify-center opacity-0 transition-opacity duration-150"
        :class="[
          screenRotation === 90 || screenRotation === 270
            ? 'h-full'
            : 'h-screen',
          viewerHideNavigationOverlay ? '' : 'hover:opacity-100',
        ]"
        @click="readingMode === 'rtl' ? store.nextPage() : store.prevPage()"
      >
        <div
          v-if="!viewerHideNavigationOverlay"
          class="from-muted-foreground/40 pointer-events-none absolute inset-0 bg-linear-to-r"
        ></div>
        <Icon
          v-if="!viewerHideNavigationOverlay"
          icon="solar:alt-arrow-left-outline"
          class="text-background drop-shadow-foreground pointer-events-none relative z-10 size-12 drop-shadow-sm"
        />
      </div>
      <div
        v-if="readingMode !== 'webtoon'"
        class="pointer-events-auto absolute top-0 right-0 z-10 flex w-1/4 max-w-[500px] cursor-pointer items-center justify-center opacity-0 transition-opacity duration-150"
        :class="[
          screenRotation === 90 || screenRotation === 270
            ? 'h-full'
            : 'h-screen',
          viewerHideNavigationOverlay ? '' : 'hover:opacity-100',
        ]"
        @click="readingMode === 'rtl' ? store.prevPage() : store.nextPage()"
      >
        <div
          v-if="!viewerHideNavigationOverlay"
          class="from-muted-foreground/40 pointer-events-none absolute inset-0 bg-linear-to-l"
        ></div>
        <Icon
          v-if="!viewerHideNavigationOverlay"
          icon="solar:alt-arrow-right-outline"
          class="text-background drop-shadow-foreground pointer-events-none relative z-10 size-12 drop-shadow-sm"
        />
      </div>
      <Transition name="fade">
        <div
          v-if="!showControls && !hidePageNumber"
          class="text-muted-foreground/50 fixed top-4 left-4 flex flex-col gap-1 text-lg font-bold"
        >
          <div>{{ currentPage }} / {{ totalPages }}</div>
          <div v-if="book?.series_collection_id" class="text-sm">
            시리즈 {{ seriesCurrentIndex || "?"
            }}{{ seriesTotalCount > 0 ? `/${seriesTotalCount}` : "" }}권
          </div>
        </div>
      </Transition>
      <!-- 토스트 알림 -->
      <Transition name="fade">
        <div
          v-if="!viewerHideToast && showToast && toastMessage"
          class="text-primary bg-secondary/75 border-secondary/75 fixed top-27 right-12 z-20 flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-lg font-semibold backdrop-blur-sm"
        >
          <Icon icon="solar:info-circle-bold-duotone" class="text-xl" />
          {{ toastMessage }}
        </div>
      </Transition>
      <div v-if="loading" class="text-center">
        <Icon
          icon="solar:spinner-8-bold-duotone"
          class="h-12 w-12 animate-spin"
        />
        <p class="mt-2">페이지를 불러오는 중...</p>
      </div>
      <div v-else-if="error" class="text-center text-red-400">
        <Icon
          icon="solar:danger-triangle-bold-duotone"
          class="mx-auto h-12 w-12"
        />
        <p class="mt-2">오류: {{ error }}</p>
      </div>

      <img
        v-if="
          !viewerDoublePageView &&
          (readingMode === 'ltr' || readingMode === 'rtl') &&
          currentImageUrl
        "
        :src="currentImageUrl"
        :alt="`Page ${currentPage}`"
        :class="imageClasses"
        :style="imageStyle"
      />

      <div
        v-if="viewerDoublePageView && readingMode !== 'webtoon'"
        class="flex h-full w-full items-center justify-center"
        :style="imageStyle"
      >
        <img
          v-if="leftPageUrl"
          :src="leftPageUrl"
          alt="Left Page"
          :class="doublePageImageClasses"
        />
        <img
          v-if="rightPageUrl"
          :src="rightPageUrl"
          alt="Right Page"
          :class="doublePageImageClasses"
        />
      </div>

      <div
        v-if="readingMode === 'webtoon'"
        ref="webtoonRef"
        class="flex h-full flex-col items-center overflow-auto"
        :class="{
          'cursor-grab': zoomLevel > 100 && !isDragging,
          'cursor-grabbing': zoomLevel > 100 && isDragging,
        }"
        @scroll="handleScroll"
      >
        <div
          class="flex flex-col items-center"
          :style="{ width: '1024px', zoom: zoomLevel / 100 }"
        >
          <img
            v-for="(path, index) in pagePaths"
            ref="webtoonImageRef"
            :key="path"
            :src="path"
            :alt="`Page ${index + 1}`"
            :data-page-num="index + 1"
            class="mb-1 w-full"
          />
        </div>
      </div>
    </div>

    <!-- 컨트롤 바 -->
    <Transition name="fade">
      <div
        v-if="showControls"
        class="bg-muted-foreground/50 fixed right-0 bottom-0 left-0 z-50 flex items-center justify-between gap-4 p-2 transition-opacity duration-300"
        style="-webkit-app-region: no-drag"
      >
        <!-- 페이지 이동 -->
        <TooltipProvider>
          <div class="flex flex-1 items-center gap-4">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  :disabled="currentPage <= 1 && readingMode !== 'webtoon'"
                  variant="ghost"
                  size="icon"
                  @click="store.prevPage()"
                >
                  <Icon icon="solar:arrow-left-bold" class="size-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p class="flex items-center gap-1">이전 페이지 <kbd>←</kbd></p>
              </TooltipContent>
            </Tooltip>
            <div class="flex flex-1 items-center gap-4">
              <Slider
                :model-value="[currentPage]"
                :min="1"
                :max="totalPages"
                :step="1"
                class="flex-1"
                @update:model-value="(v) => store.goToPage(v![0])"
              />
            </div>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  :disabled="
                    currentPage >= totalPages && readingMode !== 'webtoon'
                  "
                  variant="ghost"
                  size="icon"
                  @click="store.nextPage()"
                >
                  <Icon icon="solar:arrow-right-bold" class="size-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p class="flex items-center gap-1">
                  다음 페이지 <kbd>→</kbd> or <kbd>Space</kbd>
                </p>
              </TooltipContent>
            </Tooltip>
            <span class="min-w-20 text-center"
              >{{ currentPage }} / {{ totalPages }}</span
            >
          </div>
        </TooltipProvider>
        <!-- 읽기 & 자동넘김 설정 -->
        <div class="flex items-center gap-2">
          <TooltipProvider v-if="externalProgramPath">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="outline"
                  size="icon"
                  @click="openInExternalProgram"
                >
                  <Icon icon="solar:monitor-bold-duotone" class="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {{
                    externalProgramPath.split("\\").pop()?.split("/").pop()
                  }}(으)로 열기
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="outline"
                  size="icon"
                  @click="isDetailOpen = true"
                >
                  <Icon icon="solar:info-circle-bold-duotone" class="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p class="flex items-center gap-1">책 정보 <kbd>`</kbd></p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <Popover :open="openSetting" @update:open="openSetting = $event">
                <TooltipTrigger as-child>
                  <PopoverTrigger as-child>
                    <Button variant="outline" size="icon">
                      <Icon
                        icon="solar:settings-bold-duotone"
                        class="h-5 w-5"
                      />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>뷰어 설정</p>
                </TooltipContent>
                <PopoverContent class="w-80">
                  <div class="grid gap-4">
                    <div class="space-y-2">
                      <h4 class="leading-none font-medium">보기 설정</h4>
                      <p class="text-muted-foreground text-sm">
                        페이지를 보는 방식을 설정합니다.
                      </p>
                    </div>
                    <div class="grid gap-2">
                      <div class="grid grid-cols-3 items-center gap-4">
                        <Label>읽기 방향</Label>
                        <div class="col-span-2">
                          <ToggleGroup
                            type="single"
                            :model-value="readingMode"
                            variant="outline"
                            @update:model-value="
                              (mode) => {
                                if (mode)
                                  store.setReadingMode(
                                    mode as 'ltr' | 'rtl' | 'webtoon',
                                  );
                              }
                            "
                          >
                            <ToggleGroupItem
                              value="ltr"
                              aria-label="Left-to-right"
                              class="flex-1"
                            >
                              <Icon
                                icon="solar:arrow-right-bold-duotone"
                                class="h-5 w-5"
                              />
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="rtl"
                              aria-label="Right-to-left"
                              class="flex-1"
                            >
                              <Icon
                                icon="solar:arrow-left-bold-duotone"
                                class="h-5 w-5"
                              />
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="webtoon"
                              aria-label="Webtoon mode"
                              class="flex-1"
                            >
                              <Icon
                                icon="solar:arrow-down-bold-duotone"
                                class="h-5 w-5"
                              />
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                      </div>
                      <div class="grid grid-cols-3 items-center gap-4">
                        <Label>더블 페이지</Label>
                        <Switch
                          :model-value="viewerDoublePageView"
                          class="col-span-2"
                          :disabled="readingMode === 'webtoon'"
                          @update:model-value="store.setDoublePage"
                        />
                      </div>
                      <div class="grid grid-cols-3 items-center gap-4">
                        <Label>표지 따로 보기</Label>
                        <Switch
                          :model-value="viewerShowCoverAlone"
                          class="col-span-2"
                          :disabled="
                            !viewerDoublePageView || readingMode === 'webtoon'
                          "
                          @update:model-value="store.setShowCoverAlone"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="mt-4 grid gap-4 border-t pt-4">
                    <div class="space-y-2">
                      <h4 class="leading-none font-medium">자동 넘김 설정</h4>
                      <p class="text-muted-foreground text-sm">
                        자동으로 페이지를 넘기는 기능에 대한 설정입니다.
                      </p>
                    </div>
                    <div class="grid gap-2">
                      <div class="grid grid-cols-3 items-center gap-4">
                        <Label>넘김 간격</Label>
                        <div class="col-span-2 flex items-center gap-2">
                          <Slider
                            :model-value="[autoPlayInterval]"
                            :min="1"
                            :max="30"
                            :step="1"
                            :disabled="isAutoPlay"
                            @update:model-value="
                              (v) => store.setAutoPlayInterval(v![0])
                            "
                          />
                          <span class="font-mono text-sm"
                            >{{ autoPlayInterval }}s</span
                          >
                        </div>
                      </div>
                      <div class="grid grid-cols-3 items-center gap-4">
                        <Label>다음 책 자동 재생</Label>
                        <Switch
                          :model-value="isAutoNextBook"
                          class="col-span-2"
                          @update:model-value="store.toggleAutoNextBook"
                        />
                      </div>
                      <div class="grid grid-cols-3 items-center gap-4">
                        <Label>재생 순서</Label>
                        <ToggleGroup
                          type="single"
                          :model-value="autoNextBookMode"
                          variant="outline"
                          class="col-span-2"
                          :disabled="!isAutoNextBook"
                          @update:model-value="
                            (mode) => {
                              if (mode)
                                store.setNextBookMode(
                                  mode as 'next' | 'random',
                                );
                            }
                          "
                        >
                          <ToggleGroupItem value="next" class="text-xs"
                            >순차</ToggleGroupItem
                          >
                          <ToggleGroupItem value="random" class="text-xs"
                            >랜덤</ToggleGroupItem
                          >
                        </ToggleGroup>
                      </div>
                      <!-- 자동 넘김 종료 설정 -->
                      <div class="grid grid-cols-3 items-center gap-4">
                        <Label>자동 넘김 종료</Label>
                        <Switch
                          :model-value="autoPlayStopPage !== null"
                          class="col-span-2"
                          @update:model-value="store.toggleAutoPlayStopPage()"
                        />
                      </div>
                      <div
                        v-if="autoPlayStopPage !== null"
                        class="grid grid-cols-3 items-center gap-4"
                      >
                        <Label class="text-muted-foreground">종료 페이지</Label>
                        <div class="col-span-2 flex items-center gap-2">
                          <Input
                            type="number"
                            :model-value="autoPlayStopPage ?? 1"
                            :min="1"
                            class="w-20"
                            @update:model-value="
                              (val) =>
                                store.setAutoPlayStopPage(Number(val) || null)
                            "
                          />
                          <span class="text-muted-foreground text-xs"
                            >페이지</span
                          >
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </Tooltip>
          </TooltipProvider>
          <ViewerHelpDialog @update:open="isHelpOpen = $event">
            <Button variant="outline" size="icon">
              <Icon icon="solar:question-circle-bold-duotone" class="h-5 w-5" />
            </Button>
          </ViewerHelpDialog>
        </div>
      </div>
    </Transition>

    <BookDetailDialog v-if="book" v-model="isDetailOpen" :book="book" />

    <!-- 책 삭제 확인 다이얼로그 -->
    <AlertDialog v-model:open="isDeleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>책을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            이 작업은 되돌릴 수 없습니다. 책과 관련된 모든 데이터가 영구적으로
            삭제됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDeleteBook"
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
* {
  user-select: none;
}
</style>
