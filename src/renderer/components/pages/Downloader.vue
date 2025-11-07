<script setup lang="ts">
import { ipcRenderer } from "@/api";
import HelpDialog from "@/components/common/HelpDialog.vue"; // HelpDialog 임포트
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input"; // Input 컴포넌트 임포트 추가
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useScrollRestoration } from "@/composable/useScrollRestoration";
import { useSearchPersistence } from "@/composable/useSearchPersistence";
import { useDownloadQueueStore } from "@/store/downloadQueueStore";
import { Icon } from "@iconify/vue";
import { useInfiniteQuery } from "@tanstack/vue-query";
import type { Gallery } from "node-hitomi";
import { AcceptableValue } from "reka-ui";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import PresetDropdown from "../common/PresetDropdown.vue";
import GalleryPreviewDialog from "../feature/downloader/GalleryPreviewDialog.vue";
import GalleryRowCard from "../feature/downloader/GalleryRowCard.vue";
import GalleryThumbnailCard from "../feature/downloader/GalleryThumbnailCard.vue";

// 검색어 상태
const searchQuery = ref("");
const offset = ref(0); // 오프셋 값 추가
const downloaderLanguage = ref("korean");

const languageOptions = [
  { value: "all", label: "전체 언어" },
  { value: "korean", label: "한국어" },
  { value: "japanese", label: "일본어" },
  { value: "english", label: "영어" },
  { value: "chinese", label: "중국어" },
];

// 뷰 모드 상태 (true: 썸네일, false: 자세히)
const isThumbnailView = ref(false);

// 임시 다운로드 경로 (추후 설정과 연동)
const downloadPath = ref(""); // 초기값은 비워둠

// 각 갤러리 ID별 다운로드 상태를 저장하는 객체
const downloadStatuses = reactive<{
  [key: number]: { status: string; progress?: number; error?: string };
}>({});

// 다운로드 큐 store
const downloadQueueStore = useDownloadQueueStore();

const searchKey = ref(0); // 검색 트리거를 위한 키

// 미리보기 다이얼로그 관련 상태
const isPreviewDialogOpen = ref(false);
const selectedGallery = ref<Gallery>();

const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  isError,
  error,
} = useInfiniteQuery({
  queryKey: ["galleries", searchKey, offset],
  queryFn: async ({ pageParam = 1 }) => {
    const finalSearchQuery =
      downloaderLanguage.value !== "all"
        ? `language:${downloaderLanguage.value} ${searchQuery.value}`
        : searchQuery.value;

    const query = {
      searchQuery: finalSearchQuery.trim(),
      offset: offset.value, // 오프셋 값 추가
    };
    const result = await ipcRenderer.invoke("search-galleries", {
      query,
      page: pageParam,
    });

    if (result.success && result.data) {
      const galleryDetailsPromises = result.data.map((id: number) =>
        ipcRenderer.invoke("get-gallery-details", id),
      );
      const detailResults = (await Promise.all(galleryDetailsPromises)) as {
        success: boolean;
        data: Gallery & { thumbnailUrl: string };
      }[];
      return {
        galleries: detailResults
          .filter((res) => res.success)
          .map((res) => res.data),
        nextPage: result.hasNextPage ? pageParam + 1 : undefined,
      };
    } else {
      throw new Error(result.error || "검색 실패");
    }
  },
  getNextPageParam: (lastPage) => lastPage.nextPage,
  initialPageParam: 1,
  enabled: computed(() => searchKey.value > 0), // searchKey가 0보다 클 때만 활성화
});

const allGalleries = computed(() => {
  return data.value?.pages?.flatMap((page) => page.galleries) || [];
});

// Intersection Observer 설정
const observerTarget = ref(null);
let observer: IntersectionObserver | null = null;

const handleSelectGallery = (gallery: Gallery) => {
  selectedGallery.value = gallery;
};

const handleBookDeleted = (galleryId: number) => {
  // 삭제된 책의 다운로드 상태 초기화
  delete downloadStatuses[galleryId];
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key.toLowerCase() === "v" && !event.ctrlKey && !event.shiftKey) {
    if (selectedGallery.value) {
      isPreviewDialogOpen.value = !isPreviewDialogOpen.value;
    }
  }
};

// 큐 상태를 downloadStatuses에 반영하는 함수
const syncQueueToStatuses = () => {
  // 현재 큐에 있는 갤러리 ID 목록
  const queueGalleryIds = new Set(
    downloadQueueStore.queue.map((item) => item.gallery_id),
  );

  // downloadStatuses에서 큐에 없는 항목 제거 (단, completed 상태는 유지)
  Object.keys(downloadStatuses).forEach((galleryIdStr) => {
    const galleryId = Number(galleryIdStr);
    if (
      !queueGalleryIds.has(galleryId) &&
      downloadStatuses[galleryId]?.status !== "completed"
    ) {
      delete downloadStatuses[galleryId];
    }
  });

  // 큐에 있는 항목들을 downloadStatuses에 업데이트
  downloadQueueStore.queue.forEach((queueItem) => {
    // 큐의 상태를 downloadStatuses에 매핑
    let mappedStatus: string = queueItem.status;

    // downloading -> progress로 매핑
    if (queueItem.status === "downloading") {
      mappedStatus = "progress";
    }

    downloadStatuses[queueItem.gallery_id] = {
      status: mappedStatus,
      progress: queueItem.progress,
      error: queueItem.error_message,
    };
  });
};

onMounted(() => {
  // 다운로드 큐 store 초기화
  downloadQueueStore.initialize();

  // 초기 큐 상태 동기화
  syncQueueToStatuses();

  observer = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        hasNextPage.value &&
        !isFetchingNextPage.value
      ) {
        fetchNextPage();
      }
    },
    { threshold: 0.1 },
  );
  if (observerTarget.value) {
    observer.observe(observerTarget.value);
  }

  // 다운로드 진행 상황 수신
  ipcRenderer.on("download-progress", (_event, ...args) => {
    const { galleryId, status, progress, error } = args[0] as {
      galleryId: number;
      status: string;
      progress?: number;
      error?: string;
    };
    downloadStatuses[galleryId] = { status, progress, error };

    if (status === "completed") {
      const completedGallery = allGalleries.value.find(
        (gallery) => gallery.id === galleryId,
      );
      if (completedGallery) {
        toast.success(
          `${completedGallery.title.display}이(가) 다운로드되었습니다.`,
        );
      }
    }
  });

  // 큐 업데이트 이벤트 수신 (큐 상태가 변경되면 downloadStatuses에 반영)
  ipcRenderer.on("download-queue-updated", () => {
    // 큐를 다시 가져와서 상태 동기화
    downloadQueueStore.fetchQueue().then(() => {
      syncQueueToStatuses();
    });
  });

  // 저장된 다운로드 경로 불러오기
  ipcRenderer.invoke("get-config-value", "downloadPath").then((path) => {
    if (path) {
      downloadPath.value = path as string;
    }
  });

  // 저장된 언어 설정 불러오기
  ipcRenderer.invoke("get-config-value", "downloaderLanguage").then((lang) => {
    if (lang) {
      downloaderLanguage.value = lang as string;
    }
  });

  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
  window.removeEventListener("keydown", handleKeyDown);

  // 큐 store cleanup
  downloadQueueStore.cleanup();
});

watch(observerTarget, (newTarget) => {
  if (observer) {
    observer.disconnect();
    if (newTarget) {
      observer.observe(newTarget);
    }
  }
});

const handleSearch = async () => {
  searchKey.value++;
};

const PAGE_SIZE = 30; // Backend limit for search-galleries

const handlePreviousPage = () => {
  if (offset.value >= PAGE_SIZE) {
    offset.value -= PAGE_SIZE;
    handleSearch(); // Trigger search with new offset
  } else if (offset.value > 0) {
    offset.value = 0; // Go to the very beginning
    handleSearch();
  }
};

const handleNextPage = () => {
  offset.value += PAGE_SIZE;
  handleSearch(); // Trigger search with new offset
};

const openFolderDialog = async () => {
  const result = await ipcRenderer.invoke("select-folder");
  if (result.success && result.path) {
    downloadPath.value = result.path;
    await ipcRenderer.invoke("set-config", {
      key: "downloadPath",
      value: result.path,
    });
  }
};

const handleLanguageChange = async (lang: AcceptableValue) => {
  if (!lang) return;
  downloaderLanguage.value = lang as string;
  await ipcRenderer.invoke("set-config", {
    key: "downloaderLanguage",
    value: lang,
  });
  // 언어 변경 시 즉시 검색 다시 실행
  if (searchQuery.value) {
    handleSearch();
  }
};

const openDownloadFolder = async () => {
  if (downloadPath.value) {
    await ipcRenderer.invoke("open-folder", downloadPath.value);
  }
};

const router = useRouter();

const goToSettings = () => {
  router.push({ path: "/settings", query: { tab: "downloader" } });
};

// 스크롤 위치 복원 (다운로더는 flex-1 사용)
useScrollRestoration(".flex-1.overflow-y-auto");

// 검색어 저장/복원
useSearchPersistence(searchQuery, "downloader-search-query");
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="flex items-center gap-2 text-2xl font-bold">
        <Icon icon="solar:download-square-bold-duotone" class="h-7 w-7" />
        다운로더
        <HelpDialog
          title="다운로더 도움말"
          description="다운로더 사용법 및 검색 팁"
        >
          <template #trigger>
            <Button variant="ghost" size="icon">
              <Icon icon="solar:question-circle-bold-duotone" class="h-6 w-6" />
            </Button>
          </template>
          <div class="text-muted-foreground space-y-4 text-sm">
            <p>
              이 화면에서는 Hitomi.la에서 작품을 검색하고 다운로드할 수
              있습니다.
            </p>
            <h3 class="text-foreground text-base font-semibold">검색 팁</h3>
            <ul class="list-inside list-disc">
              <li>
                <Icon
                  icon="solar:global-bold-duotone"
                  class="inline-block h-4 w-4 align-text-bottom"
                />
                언어 설정을 통해 검색할 작품의 언어를 지정할 수 있습니다.
              </li>
              <li>
                <Icon
                  icon="solar:bookmark-bold-duotone"
                  class="inline-block h-4 w-4 align-text-bottom"
                />
                버튼을 클릭하여 저장된 프리셋 검색어를 사용할 수 있습니다.
              </li>
              <li><code>id:12345</code>: 특정 갤러리 ID로 검색합니다.</li>
              <li>
                <code>artist:작가명</code>: 특정 작가의 작품을 검색합니다.
              </li>
              <li>
                <code>tag:태그명</code>: 특정 태그가 포함된 작품을 검색합니다.
              </li>
              <li>여러 검색어를 공백으로 구분하여 조합할 수 있습니다.</li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">
              다운로드 관리
            </h3>
            <ul class="list-inside list-disc">
              <li>
                검색 결과에서 작품을 클릭하여 상세 정보를 확인하고 다운로드할 수
                있습니다.
              </li>
              <li>다운로드 경로는 설정에서 변경할 수 있습니다.</li>
              <li>다운로드 진행 상황은 각 작품 카드에서 확인할 수 있습니다.</li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">미리보기</h3>
            <ul class="list-inside list-disc">
              <li>
                검색 결과에서 작품을 선택한 후 <kbd>V</kbd> 키를 눌러 미리보기
                다이얼로그를 열 수 있습니다.
              </li>
            </ul>
          </div>
        </HelpDialog>
      </h1>
      <Button variant="secondary" size="icon" @click="goToSettings">
        <Icon icon="solar:settings-bold-duotone" class="h-6 w-6" />
      </Button>
    </div>

    <div class="grid flex-1 grid-cols-1 gap-6 overflow-y-auto lg:grid-cols-3">
      <!-- Left Column: Search & Settings -->
      <div
        class="flex flex-col gap-6 lg:sticky lg:top-0 lg:col-span-1 lg:h-fit"
      >
        <Card>
          <CardHeader>
            <CardTitle>다운로드 위치</CardTitle>
          </CardHeader>
          <CardContent>
            <!-- flex-col sm:items-center justify-between  sm:flex-row items-start -->
            <div v-if="downloadPath" class="flex flex-col gap-4">
              <p class="text-muted-foreground text-sm break-all">
                <code class="font-mono">{{ downloadPath }}</code>
              </p>
              <div class="flex flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-shrink-0"
                  @click="openFolderDialog"
                >
                  <Icon
                    icon="solar:folder-open-bold-duotone"
                    class="h-4 w-4"
                  />변경
                </Button>
                <Button
                  v-if="downloadPath"
                  variant="outline"
                  size="sm"
                  class="flex-shrink-0"
                  @click="openDownloadFolder"
                >
                  <Icon icon="solar:folder-bold-duotone" class="h-4 w-4" />폴더
                  열기
                </Button>
              </div>
            </div>
            <div v-else class="flex items-center justify-between">
              <p class="text-destructive text-sm">폴더를 지정해주세요.</p>
              <Button size="sm" @click="openFolderDialog">
                <Icon
                  icon="solar:folder-open-bold-duotone"
                  class="h-4 w-4"
                />폴더 지정
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center justify-between">
              <span>작품 검색</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              class="mb-4 flex flex-col items-start justify-between gap-2 md:flex-row lg:flex-col"
            >
              <div class="flex flex-col">
                <Label for="offset-input">시작 오프셋</Label>
                <p class="text-muted-foreground text-sm">
                  검색 결과를 시작할 검색 인덱스를 지정합니다.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Input
                  id="offset-input"
                  v-model.number="offset"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="w-24"
                />
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="offset === 0"
                  @click="handlePreviousPage"
                >
                  <Icon icon="solar:arrow-left-bold-duotone" class="h-4 w-4" />
                  이전
                </Button>
                <Button variant="outline" size="sm" @click="handleNextPage">
                  다음
                  <Icon icon="solar:arrow-right-bold-duotone" class="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div class="grid grid-cols-1 items-end gap-4 sm:grid-cols-4">
              <div
                class="col-span-full flex flex-col space-y-1.5 sm:col-span-1 lg:col-span-full xl:col-span-2 2xl:col-span-1"
              >
                <Label for="language-select">언어</Label>
                <Select
                  :model-value="downloaderLanguage"
                  @update:model-value="handleLanguageChange"
                >
                  <SelectTrigger id="language-select" class="w-full">
                    <SelectValue placeholder="언어를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="lang in languageOptions"
                      :key="lang.value"
                      :value="lang.value"
                    >
                      {{ lang.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div
                class="col-span-full flex flex-col space-y-1.5 sm:col-span-3 lg:col-span-full xl:col-span-2 2xl:col-span-3"
              >
                <Label for="search-input">검색어</Label>
                <SmartSearchInput
                  id="search-input"
                  v-model="searchQuery"
                  placeholder="예: artist:작가명 tag:태그명"
                  @keyup.enter="handleSearch"
                />
              </div>
            </div>
            <p class="text-muted-foreground pt-2 text-xs">
              검색은 히토미 검색과 동일한 문법을 지원합니다. (예:
              <code class="font-mono"
                >female:sole_female female:very_long_hair</code
              >)
            </p>
          </CardContent>
          <CardFooter class="flex items-center gap-2">
            <PresetDropdown
              v-model="searchQuery"
              @apply-preset="handleSearch"
            />
            <Button class="flex-grow" @click="handleSearch">
              <Icon icon="solar:magnifer-bold-duotone" class="h-5 w-5" />검색
            </Button>
          </CardFooter>
        </Card>
      </div>

      <!-- Right Column: Search Results -->
      <div class="flex flex-col gap-4 lg:col-span-2">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">검색 결과</h2>
          <div class="flex items-center space-x-2">
            <Label for="view-mode-switch">썸네일</Label>
            <Switch id="view-mode-switch" v-model="isThumbnailView" />
          </div>
        </div>

        <div class="min-h-[60vh] flex-1 overflow-y-auto rounded-lg border p-2">
          <div v-if="isLoading" class="flex h-full items-center justify-center">
            <p class="text-muted-foreground">
              <Icon icon="svg-spinners:ring-resize" class="size-8" />
            </p>
          </div>
          <div
            v-else-if="isError"
            class="text-destructive flex h-full items-center justify-center"
          >
            <p>오류 발생: {{ error?.message }}</p>
          </div>
          <div v-else-if="allGalleries.length > 0">
            <div
              v-if="isThumbnailView"
              class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3"
            >
              <GalleryThumbnailCard
                v-for="item in allGalleries"
                :key="item.id"
                :gallery="item"
                :download-status="downloadStatuses[item.id]"
                :selected="selectedGallery?.id === item.id"
                @select-gallery="handleSelectGallery"
                @preview-gallery="
                  (gallery) => {
                    handleSelectGallery(gallery);
                    isPreviewDialogOpen = true;
                  }
                "
                @book-deleted="handleBookDeleted"
              />
            </div>
            <div v-else class="flex flex-col gap-2">
              <GalleryRowCard
                v-for="item in allGalleries"
                :key="item.id"
                :gallery="item"
                :download-status="downloadStatuses[item.id]"
                :selected="selectedGallery?.id === item.id"
                @select-gallery="handleSelectGallery"
                @preview-gallery="
                  (gallery) => {
                    handleSelectGallery(gallery);
                    isPreviewDialogOpen = true;
                  }
                "
                @book-deleted="handleBookDeleted"
              />
            </div>
            <div ref="observerTarget" class="h-10 w-full"></div>
            <div
              v-if="isFetchingNextPage"
              class="text-muted-foreground py-4 text-center"
            >
              <p>더 많은 결과 불러오는 중...</p>
            </div>
          </div>
          <div v-else class="flex h-full items-center justify-center">
            <p class="text-muted-foreground">검색 결과가 없습니다.</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <GalleryPreviewDialog
    :open="isPreviewDialogOpen"
    :gallery="selectedGallery"
    @update:open="isPreviewDialogOpen = $event"
  />
</template>
