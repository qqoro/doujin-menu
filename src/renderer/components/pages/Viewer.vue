<script setup lang="ts">
import {
  addBookHistory,
  isNewWindow as apiIsNewWindow,
  closeCurrentWindow,
  getBook,
  ipcRenderer,
} from "@/api";
import BookDetailDialog from "@/components/feature/BookDetailDialog.vue";
import ViewerHelpDialog from "@/components/feature/viewer/ViewerHelpDialog.vue";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWindowEvent } from "@/composable/useWindowEvent";
import { useViewerStore } from "@/store/viewerStore";
import { Icon } from "@iconify/vue";
import { useQuery } from "@tanstack/vue-query";
import { useThrottleFn } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const store = useViewerStore();

const isNewWindow = ref(false);

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
  viewerAutoFitZoom,
  is_favorite,
  viewerDoublePageView,
  viewerShowCoverAlone,
  leftPageUrl,
  rightPageUrl,
  showToast,
  toastMessage,
  images,
} = storeToRefs(store);

const { data: book } = useQuery({
  queryKey: [bookId, is_favorite],
  enabled: () => !!bookId.value,
  queryFn: () => getBook(bookId.value!),
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

const viewerArea = ref<HTMLElement | null>(null);
const screenRef = ref<HTMLElement | null>(null);
const webtoonRef = ref<HTMLElement | null>(null);
const webtoonImageRef = ref<HTMLElement[] | null>(null);

const showCursor = ref(true);
const showControls = ref(true);
const openSetting = ref(false);
const isHelpOpen = ref(false);
const isDetailOpen = ref(false);

let cursorHideTimer: number;
const handleMouseMove = (e: MouseEvent) => {
  showCursor.value = true;
  clearTimeout(cursorHideTimer);
  cursorHideTimer = window.setTimeout(() => {
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

const handleKeyDown = async (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    if (isNewWindow.value) {
      closeCurrentWindow();
    } else {
      router.back();
    }
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    ipcRenderer.send("maximize-toggle-window");
    return;
  }

  if (e.key === "\\") {
    e.preventDefault();
    store.loadNextBook("random");
    return;
  }

  if (e.key.toLowerCase() === "a") {
    store.toggleAutoNextBook();
  }

  if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
    e.preventDefault();
    store.startAutoPlayWithInterval(Number(e.key));
    return;
  }
  if (e.ctrlKey && e.key === "0") {
    e.preventDefault();
    store.stopAutoPlay();
    return;
  }

  if (e.key === "Home") {
    e.preventDefault();
    store.goToPage(1);
    return;
  }
  if (e.key === "End") {
    e.preventDefault();
    store.goToPage(totalPages.value);
    return;
  }
  if (e.key === "[") {
    e.preventDefault();
    store.loadPrevBook();
    return;
  }
  if (e.key === "]") {
    e.preventDefault();
    store.loadNextBook("next"); // Always sequential for shortcut
    return;
  }
  if (e.key === " ") {
    store.nextPage();
    return;
  }
  if (e.key === "`") {
    e.preventDefault();
    isDetailOpen.value = !isDetailOpen.value;
    return;
  }

  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    if (readingMode.value === "rtl") {
      store.prevPage();
    } else {
      store.nextPage();
    }
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    if (readingMode.value === "rtl") {
      store.nextPage();
    } else {
      store.prevPage();
    }
  }
};

const handleWheel = (e: WheelEvent) => {
  if (readingMode.value === "webtoon") return;

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
    addBookHistory(bookId);
  }
});

onUnmounted(() => {
  store.cleanup();
  ipcRenderer.send("set-fullscreen-window", false);
});

useWindowEvent("mousemove", useThrottleFn(handleMouseMove, 100, true));
useWindowEvent("keydown", useThrottleFn(handleKeyDown, 100, true));
useWindowEvent("wheel", useThrottleFn(handleWheel, 100, true));
useWindowEvent("mouseup", handleMouseUp);
</script>

<template>
  <div
    ref="screenRef"
    class="h-screen flex flex-col"
    :class="{ 'cursor-none': !showCursor }"
  >
    <!-- 헤더 -->
    <Transition name="fade">
      <div
        v-if="showControls"
        class="fixed top-0 left-0 right-0 bg-muted-foreground/50 p-4 z-10 transition-opacity duration-300"
        style="-webkit-app-region: drag"
      >
        <TooltipProvider>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 flex-1 min-w-0">
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
              <h1 class="text-xl font-bold truncate">
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
                      class="w-6 h-6"
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
                      class="w-6 h-6"
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
                      class="w-6 h-6"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p class="flex items-center gap-1">다음 책 <kbd>]</kbd></p>
                </TooltipContent>
              </Tooltip>
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
                      class="w-6 h-6"
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
      class="flex-1 flex items-center justify-center overflow-auto relative"
    >
      <div
        v-if="readingMode !== 'webtoon'"
        class="absolute left-0 top-0 h-screen w-1/4 max-w-[500px] from-muted-foreground/40 bg-linear-to-r text-background flex justify-center items-center opacity-0 hover:opacity-100 transition-opacity duration-150"
        @click="readingMode === 'rtl' ? store.nextPage() : store.prevPage()"
      >
        <Icon
          icon="solar:alt-arrow-left-outline"
          class="size-12 drop-shadow-sm drop-shadow-foreground"
        />
      </div>
      <div
        v-if="readingMode !== 'webtoon'"
        class="absolute right-0 top-0 h-screen w-1/4 max-w-[500px] from-muted-foreground/40 bg-linear-to-l text-background flex justify-center items-center opacity-0 hover:opacity-100 transition-opacity duration-150"
        @click="readingMode === 'rtl' ? store.prevPage() : store.nextPage()"
      >
        <Icon
          icon="solar:alt-arrow-right-outline"
          class="size-12 drop-shadow-sm drop-shadow-foreground"
        />
      </div>
      <Transition name="fade">
        <div
          v-if="!showControls"
          class="fixed top-4 left-4 text-muted-foreground/50 font-bold text-lg"
        >
          {{ currentPage }} / {{ totalPages }}
        </div>
      </Transition>
      <!-- 토스트 알림 -->
      <Transition name="fade">
        <div
          v-if="showToast && toastMessage"
          class="fixed top-27 right-12 text-foreground bg-secondary/75 border-secondary/75 border backdrop-blur-sm font-semibold text-lg px-4 py-2 flex justify-center items-center rounded-lg gap-2"
        >
          <Icon icon="solar:info-circle-bold-duotone" class="text-xl" />
          {{ toastMessage }}
        </div>
      </Transition>
      <div v-if="loading" class="text-center">
        <Icon
          icon="solar:spinner-8-bold-duotone"
          class="w-12 h-12 animate-spin"
        />
        <p class="mt-2">페이지를 불러오는 중...</p>
      </div>
      <div v-else-if="error" class="text-center text-red-400">
        <Icon
          icon="solar:danger-triangle-bold-duotone"
          class="w-12 h-12 mx-auto"
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
      />

      <div
        v-if="viewerDoublePageView && readingMode !== 'webtoon'"
        class="flex items-center justify-center w-full h-full"
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
        class="flex flex-col items-center w-full h-full overflow-y-auto"
        @scroll="handleScroll"
      >
        <img
          v-for="(path, index) in pagePaths"
          ref="webtoonImageRef"
          :key="path"
          :src="path"
          :alt="`Page ${index + 1}`"
          :data-page-num="index + 1"
          class="w-full max-w-4xl mb-1"
        />
      </div>
    </div>

    <!-- 컨트롤 바 -->
    <Transition name="fade">
      <div
        v-if="showControls"
        class="fixed bottom-0 left-0 right-0 bg-muted-foreground/50 p-2 flex items-center justify-between gap-4 z-10 transition-opacity duration-300"
        style="-webkit-app-region: no-drag"
      >
        <!-- 페이지 이동 -->
        <TooltipProvider>
          <div class="flex items-center gap-4 flex-1">
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
            <div class="flex-1 flex items-center gap-4">
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
            <span class="text-center min-w-20"
              >{{ currentPage }} / {{ totalPages }}</span
            >
          </div>
        </TooltipProvider>
        <!-- 읽기 & 자동넘김 설정 -->
        <div class="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="outline"
                  size="icon"
                  @click="isDetailOpen = true"
                >
                  <Icon icon="solar:info-circle-bold-duotone" class="w-5 h-5" />
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
                        class="w-5 h-5"
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
                      <h4 class="font-medium leading-none">보기 설정</h4>
                      <p class="text-sm text-muted-foreground">
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
                                class="w-5 h-5"
                              />
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="rtl"
                              aria-label="Right-to-left"
                              class="flex-1"
                            >
                              <Icon
                                icon="solar:arrow-left-bold-duotone"
                                class="w-5 h-5"
                              />
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="webtoon"
                              aria-label="Webtoon mode"
                              class="flex-1"
                            >
                              <Icon
                                icon="solar:arrow-down-bold-duotone"
                                class="w-5 h-5"
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
                  <div class="grid gap-4 pt-4 mt-4 border-t">
                    <div class="space-y-2">
                      <h4 class="font-medium leading-none">자동 넘김 설정</h4>
                      <p class="text-sm text-muted-foreground">
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
                          <span class="text-sm font-mono"
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
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </Tooltip>
          </TooltipProvider>
          <ViewerHelpDialog @update:open="isHelpOpen = $event">
            <Button variant="outline" size="icon">
              <Icon icon="solar:question-circle-bold-duotone" class="w-5 h-5" />
            </Button>
          </ViewerHelpDialog>
        </div>
      </div>
    </Transition>

    <BookDetailDialog v-model="isDetailOpen" :book="book" />
  </div>
</template>

<style scoped>
* {
  user-select: none;
}
</style>
