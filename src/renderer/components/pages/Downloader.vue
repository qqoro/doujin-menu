<script setup lang="ts">
import * as api from "@/api";
import { ipcRenderer } from "@/api";
import type { DownloadProgressEvent } from "../../../types/ipc";
import HelpDialog from "@/components/common/HelpDialog.vue";
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGalleryDelete } from "@/composables/useGalleryDelete";
import { useKeybindings } from "@/composables/useKeybindings";
import {
  runWhenReady,
  useIndexScrollRestoration,
} from "@/composables/useScrollRestoration";
import { useSearchPersistence } from "@/composables/useSearchPersistence";
import { useZoomWheel } from "@/composables/useZoomWheel";
import {
  CHUNK_SIZE,
  clampPage,
  computeGridMetrics,
  getOffset,
  getPageCount,
  getShownCount,
  locateNth,
  visibleRange,
} from "@/lib/downloaderVirtual";
import {
  chunksForRange,
  computeListCols,
  LIST_GAP,
  measuredRowHeight,
  MIN_LIST_CARD_WIDTH,
  shouldShowSkeleton,
} from "@/lib/virtualList";
import { listRowEstimate } from "@/lib/cardLayout";
import { LANGUAGE_OPTIONS, withLanguage } from "@/lib/subscriptionQuery";
import { useDownloadQueueStore } from "@/store/downloadQueueStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import { useQueries, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useThrottleFn } from "@vueuse/core";
import type { GalleryDto } from "@/../types/ipc";
import { AcceptableValue } from "reka-ui";
import {
  computed,
  onActivated,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import PresetDropdown from "../common/PresetDropdown.vue";
import ViewOptionsBar from "../common/ViewOptionsBar.vue";
import PageToolbar from "../layout/PageToolbar.vue";
import BlacklistTagPopover from "../feature/downloader/BlacklistTagPopover.vue";
import GalleryPreviewDialog from "../feature/downloader/GalleryPreviewDialog.vue";
import GalleryRowCard from "../feature/downloader/GalleryRowCard.vue";
import GalleryThumbnailCard from "../feature/downloader/GalleryThumbnailCard.vue";
import PageHeader from "../layout/PageHeader.vue";
import SubscriptionToolbar from "../feature/downloader/SubscriptionToolbar.vue";

const uiStore = useUiStore();
const router = useRouter();
const queryClient = useQueryClient();

// 썸네일 그리드 줌 스타일
const downloaderGridStyle = computed(() => ({
  zoom: uiStore.thumbnailZoom,
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
}));

// Ctrl+Wheel로 썸네일 줌 조절. 그리드와 리스트 양쪽에 붙습니다
const { handleZoomWheel } = useZoomWheel();

// 검색어 상태
const searchQuery = ref("");
const downloaderLanguage = ref("korean");

const languageOptions = LANGUAGE_OPTIONS;

const downloaderPopularity = ref<"" | "day" | "week" | "month" | "year">("");

// reka-ui의 SelectItem은 빈 문자열 value를 금지합니다("선택 해제"로 예약돼 있어
// 항목이 에러로 죽고 placeholder만 남습니다). 설정과 IPC는 계속 ""를 "전체"로
// 쓰되, 셀렉트 위젯 앞에서만 이 센티넬로 바꿔 끼웁니다.
const POPULARITY_ALL = "all";

// 주의: 이건 "정렬"이 아니라 "필터"입니다. node-hitomi는 인기 목록을
// 교집합 대상으로만 쓰고 결과 순서는 항상 인덱스 순(최신순)입니다.
const popularityOptions = [
  { value: POPULARITY_ALL, label: "전체 작품" },
  { value: "day", label: "인기 작품만 · 오늘" },
  { value: "week", label: "인기 작품만 · 주간" },
  { value: "month", label: "인기 작품만 · 월간" },
  { value: "year", label: "인기 작품만 · 연간" },
];

const popularitySelectValue = computed(
  () => downloaderPopularity.value || POPULARITY_ALL,
);

// 뷰 모드 상태 ("grid": 썸네일, "list": 리스트)
const viewMode = ref<"grid" | "list">(
  (localStorage.getItem("downloaderViewMode") as "grid" | "list") || "list",
);

// 화면을 떠나도 뷰 모드를 유지합니다 (빈 값 방어는 ViewOptionsBar가 합니다)
const handleViewModeChange = (value: "grid" | "list") => {
  viewMode.value = value;
  localStorage.setItem("downloaderViewMode", value);
};

// 다운로드 경로. 카드마다 읽던 것을 여기서 한 번만 읽어 내려줍니다.
const downloadPath = ref("");

// 각 갤러리 ID별 다운로드 상태를 저장하는 객체
const downloadStatuses = reactive<{
  [key: number]: { status: string; progress?: number; error?: string };
}>({});

const downloadQueueStore = useDownloadQueueStore();
const subscriptionStore = useSubscriptionStore();

const searchKey = ref(0); // 검색 트리거를 위한 키
const blacklistTags = ref<string[]>([]);

// 미리보기 다이얼로그 관련 상태
const isPreviewDialogOpen = ref(false);
const selectedGallery = ref<GalleryDto>();

/** 현재 보고 있는 PAGE 단위 구간 (0-based). offset·shownCount는 여기서 유도된다 */
const currentPage = ref(0);

/**
 * 검색 / 구독 탭. 툴바만 갈리고 결과 목록은 두 탭이 공유한다.
 *
 * get-subscription-feed의 응답 모양을 search-galleries와 같게 맞춰 두었기 때문에
 * (total·generation 포함) 청크·가상 스크롤·좌표계 로직을 그대로 쓴다.
 */
const activeTab = ref<"search" | "subscription">("search");
const isSubscriptionTab = computed(() => activeTab.value === "subscription");

/** 구독 피드 재조회 트리거. 폴링 결과가 오거나 수동 새로고침을 하면 올린다 */
const subscriptionKey = ref(1);

/** 활성 탭의 조회 트리거. 검색은 버튼을 눌러야 올라가고 구독은 항상 준비돼 있다 */
const sourceKey = computed(() =>
  isSubscriptionTab.value ? subscriptionKey.value : searchKey.value,
);

/**
 * 목록을 그릴 준비가 됐는지.
 *
 * 검색 탭은 검색 버튼을 눌러야 하지만 구독 탭에는 검색 버튼이 없다.
 * searchKey만 보면 구독 탭이 영영 빈 화면이 된다.
 */
const isSourceReady = computed(
  () => isSubscriptionTab.value || searchKey.value > 0,
);

/** 입력창에 있는 검색어·언어를 합친 값. 조회는 아래 `committedSearch`를 쓴다 */
const finalSearchQuery = computed(() =>
  withLanguage(downloaderLanguage.value, searchQuery.value),
);

/**
 * 검색 버튼을 누른 시점의 조회 조건. 모든 조회는 이것만 읽는다.
 *
 * queryFn이 입력값을 직접 읽으면 검색어가 queryKey에 없는데 값만 바뀌므로, 그
 * 뒤에 새로 페칭되는 청크만 새 검색어로 조회되어 한 화면에 두 검색 결과가
 * 섞인다. queryKey에 검색어를 넣으면 타이핑 한 글자마다 재검색이 되므로, 키에
 * 넣는 대신 버튼을 누른 시점에 값을 못박는다.
 */
const committedSearch = ref<{
  query: string;
  popularity: typeof downloaderPopularity.value;
}>({ query: "", popularity: "" });

/**
 * 입력값이 아직 조회에 반영되지 않은 상태. 다른 화면은 고치는 즉시 걸러지는데
 * 여기만 검색 버튼을 눌러야 해서 버튼으로 알린다.
 */
const hasPendingSearch = computed(
  () =>
    finalSearchQuery.value !== committedSearch.value.query ||
    downloaderPopularity.value !== committedSearch.value.popularity,
);

// 스크롤 영역 높이를 잡으려면 청크가 오기 전에 total이 필요해 ID 1건만 먼저
// 요청한다. 메인의 ID 캐시를 청크 조회와 공유하므로 인덱스를 두 번 받지 않는다.
const {
  data: searchMeta,
  isLoading: isMetaLoading,
  isError,
  error,
} = useQuery({
  queryKey: ["gallery-meta", activeTab, sourceKey],
  queryFn: async () => {
    if (isSubscriptionTab.value) {
      const result = await ipcRenderer.invoke("get-subscription-feed", {
        start: 0,
        count: 1,
      });
      if (!result.success)
        throw new Error(result.error || "구독 목록 조회 실패");
      return {
        total: result.total ?? 0,
        generation: result.generation ?? 0,
      };
    }

    const result = await ipcRenderer.invoke("search-galleries", {
      searchQuery: committedSearch.value.query,
      popularityOrderBy: committedSearch.value.popularity,
      start: 0,
      count: 1,
    });
    if (!result.success) throw new Error(result.error || "검색 실패");
    return {
      total: result.total ?? 0,
      generation: result.generation ?? 0,
    };
  },
  enabled: isSourceReady,
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: 1,
});

const totalCount = computed(() => searchMeta.value?.total ?? 0);

/**
 * 검색 결과 ID 배열의 세대. 히토미 인덱스는 신작이 앞에 붙는 구조라, 캐시 TTL이
 * 만료돼 재조회하면 같은 start가 다른 작품을 가리킨다. 청크 queryKey에 이 값이
 * 들어가야 옛 좌표계와 새 좌표계가 섞이지 않는다.
 */
const generation = computed(() => searchMeta.value?.generation ?? 0);

const pageCount = computed(() => getPageCount(totalCount.value));
const offset = computed(() => getOffset(currentPage.value));
const shownCount = computed(() =>
  getShownCount(totalCount.value, currentPage.value),
);

// 보이는 절대 인덱스 범위를 30개 단위 청크로 나눠 필요한 것만 조회한다. 청크
// 번호는 페이지가 아니라 전체 결과 기준 절대 번호라 구간을 오가도 캐시에 남는다.
const visibleAbsRange = ref<{ start: number; end: number } | null>(null);

const activeChunks = computed(() => {
  if (!isSourceReady.value || totalCount.value === 0) return [];

  // 가상 스크롤러가 아직 범위를 못 정한 초기 상태에서는 구간 첫 청크를 쓴다
  const range = visibleAbsRange.value ?? {
    start: offset.value,
    end: offset.value + CHUNK_SIZE - 1,
  };

  const limit = offset.value + shownCount.value - 1;
  return chunksForRange(
    Math.max(offset.value, range.start),
    Math.min(limit, range.end),
    CHUNK_SIZE,
  );
});

const chunkQueries = useQueries({
  queries: computed(() =>
    activeChunks.value.map((chunkIndex) => ({
      // 탭 식별자가 없으면 두 탭이 같은 캐시 칸을 쓴다. staleTime 안이면
      // queryFn이 호출조차 되지 않아 검색 결과가 구독 탭 자리에 그대로 뜬다
      queryKey: [
        "gallery-chunk",
        activeTab.value,
        sourceKey.value,
        generation.value,
        chunkIndex,
      ],
      queryFn: async () => {
        const result = isSubscriptionTab.value
          ? await ipcRenderer.invoke("get-subscription-feed", {
              start: chunkIndex * CHUNK_SIZE,
              count: CHUNK_SIZE,
            })
          : await ipcRenderer.invoke("search-galleries", {
              searchQuery: committedSearch.value.query,
              popularityOrderBy: committedSearch.value.popularity,
              start: chunkIndex * CHUNK_SIZE,
              count: CHUNK_SIZE,
            });
        if (!result.success || !result.data) {
          throw new Error(result.error || "목록을 불러오지 못했습니다");
        }

        const detailResults = (await Promise.all(
          result.data.map((id: number) =>
            ipcRenderer.invoke("get-gallery-details", id),
          ),
        )) as {
          success: boolean;
          data: GalleryDto;
        }[];

        const galleries = detailResults
          .filter((res) => res.success)
          .map((res) => res.data);

        return {
          chunkIndex,
          galleries,
          // 조용히 사라진 항목 수. 배너로 알려주고 다시 시도할 수 있게 합니다.
          failedCount: detailResults.length - galleries.length,
        };
      },
      // 기본값(staleTime 0)이면 청크가 화면에 다시 들어올 때마다 백그라운드
      // refetch가 돕니다. 위아래로 10회만 왕복해도 수백 번의 IPC가 됩니다.
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  ),
});

/**
 * 절대 인덱스 → 갤러리. 없는 인덱스는 undefined.
 * 들고 있는 게 결과 전체가 아니라 드문드문한 몇 개 청크뿐이라 Map을 쓴다.
 */
const galleryByIndex = computed(() => {
  const map = new Map<number, GalleryDto>();
  for (const query of chunkQueries.value) {
    const data = query.data;
    if (!data) continue;
    data.galleries.forEach((gallery, i) => {
      map.set(data.chunkIndex * CHUNK_SIZE + i, gallery);
    });
  }
  return map;
});

/** 지금 화면에 그려진 갤러리들. 존재 여부 배치 조회에 쓴다 */
const loadedGalleries = computed(() => [...galleryByIndex.value.values()]);

/** 구간 안 인덱스로 갤러리를 찾는다. 템플릿 좌표라 offset을 더해 절대 좌표로 올린다 */
const itemAt = (localIndex: number) =>
  galleryByIndex.value.get(offset.value + localIndex);

// 상세 조회에 실패해 화면에서 빠진 항목 수
const failedDetailCount = computed(() =>
  chunkQueries.value.reduce(
    (sum, query) => sum + (query.data?.failedCount ?? 0),
    0,
  ),
);

/**
 * 이번 검색에서 목록을 한 번이라도 그렸는지. 전체 스켈레톤을 첫 렌더 전으로
 * 제한하는 데 쓴다 (`shouldShowSkeleton` 주석 참고).
 */
const hasRenderedList = ref(false);

watch(
  () => loadedGalleries.value.length > 0,
  (loaded) => {
    if (loaded) hasRenderedList.value = true;
  },
  { immediate: true },
);

const isLoading = computed(() =>
  shouldShowSkeleton({
    searchStarted: isSourceReady.value,
    isMetaLoading: isMetaLoading.value,
    total: totalCount.value,
    hasRendered: hasRenderedList.value,
  }),
);

const retryFailedDetails = () => {
  // 탭 키까지 넣는다. 접두사만 주면 다른 탭의 캐시된 청크까지 함께 버려진다
  queryClient.invalidateQueries({
    queryKey: ["gallery-chunk", activeTab.value],
  });
};

// 라이브러리 보유 여부. 화면에 있는 ID를 모아 한 번에 묻는다. 갤러리 상세와
// 쿼리 키를 분리해야 보유 여부만 다시 조회할 때 상세 30건이 딸려오지 않는다.
const galleryIds = computed(() => loadedGalleries.value.map((item) => item.id));

const { data: bookExistsMap, refetch: refetchBookExists } = useQuery({
  queryKey: ["downloader-book-exists", galleryIds],
  queryFn: async () => {
    const result = await ipcRenderer.invoke(
      "check-books-exist-by-hitomi-ids",
      galleryIds.value,
    );
    return result.success ? (result.data ?? {}) : {};
  },
  enabled: computed(() => galleryIds.value.length > 0),
  staleTime: 30 * 1000,
});

/**
 * 배치 조회 결과보다 우선하는 로컬 보정값. 삭제 직후 재조회 응답이 오기 전까지
 * "보유중" 배지가 잠깐 더 보이는 사이를 메운다.
 */
const bookIdOverrides = reactive<Record<number, number | null>>({});

const resolveBookId = (galleryId: number): number | null => {
  if (galleryId in bookIdOverrides) return bookIdOverrides[galleryId];
  return bookExistsMap.value?.[galleryId] ?? null;
};

const handleSelectGallery = (gallery: GalleryDto) => {
  selectedGallery.value = gallery;
};

const handleBookDeleted = (galleryId: number) => {
  // 삭제된 책의 다운로드 상태 초기화
  delete downloadStatuses[galleryId];
  bookIdOverrides[galleryId] = null;
  refetchBookExists();
};

// 삭제 다이얼로그는 카드가 아니라 페이지가 들고 있습니다.
// 카드가 들고 있으면 다이얼로그를 연 채 스크롤할 때 카드와 함께 사라집니다.
const {
  isOpen: isDeleteDialogOpen,
  permanentDelete,
  requestDelete,
  confirmDelete,
} = useGalleryDelete(handleBookDeleted);

// 다운로더 단축키 등록 (미리보기 토글)
useKeybindings("downloader", {
  "downloader:preview-toggle": () => {
    if (selectedGallery.value) {
      isPreviewDialogOpen.value = !isPreviewDialogOpen.value;
    }
  },
});

/**
 * 설정을 다시 읽는다. 이 화면은 keep-alive라 onMounted가 한 번만 돌아서, 설정
 * 화면에서 차단 태그를 바꾸고 돌아온 경우를 onActivated에서 받는다.
 */
const loadDownloaderConfig = async () => {
  const config = await ipcRenderer.invoke("get-config");

  if (config.downloadPath) {
    downloadPath.value = config.downloadPath as string;
  }
  if (config.downloaderLanguage) {
    downloaderLanguage.value = config.downloaderLanguage as string;
  }
  if (config.downloaderPopularity !== undefined) {
    downloaderPopularity.value = config.downloaderPopularity as
      "" | "day" | "week" | "month" | "year";
  }

  const next = (config.downloaderBlacklistTags as string[]) || [];
  const changed = next.join(",") !== blacklistTags.value.join(",");
  blacklistTags.value = next;

  if (changed && isSourceReady.value) {
    queryClient.invalidateQueries({ queryKey: ["gallery-meta"] });
    queryClient.invalidateQueries({ queryKey: ["gallery-chunk"] });
    // 구독 피드는 메인 프로세스가 들고 있어서 무효화만으로는 안 바뀐다.
    // 차단 태그는 폴링에도 적용되므로 다시 만들어야 반영된다
    if (isSubscriptionTab.value) void refreshSubscriptionFeed();
  }
};

/** 구독 피드를 다시 만들고 화면을 갱신한다 */
const refreshSubscriptionFeed = async () => {
  try {
    await api.refreshSubscriptions();
  } catch (err) {
    console.error("구독 새로고침 실패:", err);
  }
  subscriptionKey.value++;
};

/** 검색어를 비운 채 구독하려 할 때 한 번 확인한다 */
const isSubscribeConfirmOpen = ref(false);

/** 구독 등록 중. 메인이 구독 전체를 한 바퀴 돌고 오므로 몇 초 걸린다 */
const isSubscribing = ref(false);

const subscribeToQuery = async (query: string) => {
  isSubscribing.value = true;
  try {
    await api.addSubscription({ query });
    toast.success("구독에 추가했습니다.");
    subscriptionKey.value++;
    void subscriptionStore.refreshStatus();
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독을 추가하지 못했습니다.",
    );
  } finally {
    isSubscribing.value = false;
  }
};

const handleSubscribeCurrentSearch = () => {
  // 검색창이 비어 있으면 finalSearchQuery는 language:korean 하나가 된다.
  // 그대로 넘기면 한국어 전체(실측 약 9만 건)를 구독하게 되므로 한 번 묻는다
  if (searchQuery.value.trim() === "") {
    isSubscribeConfirmOpen.value = true;
    return;
  }
  void subscribeToQuery(finalSearchQuery.value);
};

/** 헤더 팝오버에서 차단 태그를 고쳤을 때 저장하고 결과를 갱신한다 */
const saveBlacklistTags = async (tags: string[]) => {
  blacklistTags.value = tags;
  await ipcRenderer.invoke("set-config", {
    key: "downloaderBlacklistTags",
    value: tags,
  });
  queryClient.invalidateQueries({ queryKey: ["config"] });
  if (searchKey.value > 0) {
    queryClient.invalidateQueries({ queryKey: ["gallery-meta"] });
    queryClient.invalidateQueries({ queryKey: ["gallery-chunk"] });
  }
  // 구독 피드는 메인이 들고 있어 무효화만으로는 안 바뀐다
  if (isSubscriptionTab.value) void refreshSubscriptionFeed();
};

// 인기 필터는 전세계 인기 목록과의 교집합이라, 언어를 함께 걸면
// 결과가 거의 없을 수 있습니다. 그 상황을 사용자에게 알려줍니다.
const showPopularityHint = computed(
  () =>
    downloaderPopularity.value !== "" &&
    downloaderLanguage.value !== "all" &&
    // 구독에는 인기순을 저장하지 않으므로 구독 탭에서는 뜨면 안 된다
    !isSubscriptionTab.value &&
    searchKey.value > 0 &&
    !isLoading.value &&
    totalCount.value < 10,
);

// 폴링이 끝나면 메인의 피드가 새로 만들어진다. 탭을 열어둔 채였다면 다시 조회한다
watch(
  () => subscriptionStore.lastCheckedAt,
  () => {
    if (isSubscriptionTab.value) subscriptionKey.value++;
  },
);

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

    if (queueItem.gallery_id === null) return;

    downloadStatuses[queueItem.gallery_id] = {
      status: mappedStatus,
      progress: queueItem.progress,
      error: queueItem.error_message,
    };
  });
};

/**
 * 다운로드 진행 상황 수신. 완료 토스트의 제목은 화면 목록이 아니라 큐에서
 * 찾는다 — 멀리 스크롤했거나 다시 검색했으면 목록에서는 못 찾는다.
 */
const handleDownloadProgress = (
  _event: Electron.IpcRendererEvent,
  { galleryId, status, progress, error }: DownloadProgressEvent,
) => {
  downloadStatuses[galleryId] = { status, progress, error };

  if (status === "completed") {
    // 다시 받은 경우 예전 삭제 보정값이 남아 있으면 안 됩니다
    delete bookIdOverrides[galleryId];
    refetchBookExists();

    const queued = downloadQueueStore.queue.find(
      (item) => item.gallery_id === galleryId,
    );
    const title =
      queued?.gallery_title ??
      loadedGalleries.value.find((gallery) => gallery.id === galleryId)?.title
        .display;

    toast.success(
      title
        ? `${title}이(가) 다운로드되었습니다.`
        : "다운로드가 완료되었습니다.",
    );
  }
};

// 큐 업데이트 이벤트 수신 (큐 상태가 변경되면 downloadStatuses에 반영)
const handleQueueUpdated = () => {
  downloadQueueStore.fetchQueue().then(() => {
    syncQueueToStatuses();
  });
};

onMounted(() => {
  // 다운로드 큐 store 초기화
  downloadQueueStore.initialize();

  // 초기 큐 상태 동기화
  syncQueueToStatuses();

  ipcRenderer.on("download-progress", handleDownloadProgress);
  ipcRenderer.on("download-queue-updated", handleQueueUpdated);

  loadDownloaderConfig();
});

onActivated(() => {
  loadDownloaderConfig();
});

onUnmounted(() => {
  // 등록한 리스너를 반드시 해제합니다. keep-alive라 평소엔 안 드러나지만
  // 남겨두면 화면이 다시 만들어질 때마다 중복 수신이 쌓입니다.
  ipcRenderer.off("download-progress", handleDownloadProgress);
  ipcRenderer.off("download-queue-updated", handleQueueUpdated);

  cancelPendingScroll?.();
  resizeObserver?.disconnect();
  downloadQueueStore.cleanup();
});

const handleSearch = () => {
  // searchKey를 올리기 전이어야 새 키로 도는 첫 조회부터 새 조건을 본다
  committedSearch.value = {
    query: finalSearchQuery.value,
    popularity: downloaderPopularity.value,
  };

  // 검색 조건이 바뀌면 모든 위치가 달라지므로 첫 구간으로 되돌린다
  currentPage.value = 0;
  visibleAbsRange.value = null;
  hasRenderedList.value = false;
  searchKey.value++;
};

/**
 * 탭을 바꾸면 좌표 상태를 되돌린다.
 *
 * 이 셋은 handleSearch에서만 초기화되는데, 탭 전환에는 그 경로가 없다.
 * 검색 결과 12만 번째를 보다 구독 탭(300건)으로 넘어가면 visibleAbsRange가
 * 범위를 한참 벗어나 chunksForRange가 빈 배열을 돌려주고, 화면이 통째로 빈다.
 */
watch(activeTab, async (tab) => {
  currentPage.value = 0;
  visibleAbsRange.value = null;
  hasRenderedList.value = false;

  if (tab !== "subscription") return;

  // 구독 탭에 실제로 들어왔을 때만 읽음 처리한다.
  // onMounted면 세션당 한 번뿐이고, onActivated면 검색하러 들어온 것만으로
  // 빨간 점이 지워진다
  subscriptionStore.markSeenLocally();
  try {
    await api.enterSubscriptionTab();
  } catch (err) {
    console.error("구독 읽음 처리 실패:", err);
  }
});

// 가상 스크롤. DOM 계층을 바꾸지 말 것:
//
//   .downloader-scroller   ← overflow-y:auto, zoom 없음. scrollTop은 실제 px
//     └ .vspace            ← 총 높이 스페이서. zoom 없음
//         └ .zoomed-grid   ← style="zoom: z". 카드만 이 안에
//             └ .card      ← top = virtualRow.start / z
//
// 스페이서를 zoom 안에 두면 렌더 높이가 총높이 × z가 되어 z=0.7이면 뒤쪽 30%에
// 도달할 수 없다. zoom 아래에서는 measureElement의 borderBoxSize와
// getBoundingClientRect도 1/z만큼 어긋난다.
const scrollerRef = ref<HTMLElement | null>(null);
const scrollerWidth = ref(0);

const GRID_PADDING = 8; // 스크롤러의 p-2
const GRID_GAP = 16; // gap-4
const MIN_CARD_WIDTH = 200;

const gridMetrics = computed(() =>
  computeGridMetrics(
    scrollerWidth.value,
    uiStore.thumbnailZoom,
    GRID_PADDING,
    GRID_GAP,
    MIN_CARD_WIDTH,
  ),
);

const listCols = computed(() =>
  computeListCols(
    scrollerWidth.value,
    uiStore.thumbnailZoom,
    GRID_PADDING,
    LIST_GAP,
    MIN_LIST_CARD_WIDTH,
  ),
);

/** 그리드는 행 단위로 가상화한다 */
const gridRowCount = computed(() =>
  Math.ceil(shownCount.value / gridMetrics.value.cols),
);

/** 리스트도 2열이 될 수 있어 행 단위로 가상화한다 */
const listRowCount = computed(() =>
  Math.ceil(shownCount.value / listCols.value),
);

const gridVirtualizer = useVirtualizer(
  computed(() => ({
    count: gridRowCount.value,
    getScrollElement: () => scrollerRef.value,
    estimateSize: () => gridMetrics.value.rowHActual,
    overscan: 2,
  })),
);

const listVirtualizer = useVirtualizer(
  computed(() => ({
    count: listRowCount.value,
    getScrollElement: () => scrollerRef.value,
    // 리스트는 행 높이가 태그 개수에 따라 달라 동적 측정합니다.
    // 리스트 뷰에는 CSS zoom이 없습니다 — 썸네일 px만 곱하므로 측정 API
    // 불일치가 없습니다. 다만 초기 추정은 그 줌을 따라가야 합니다.
    // 고정값으로 두면 최소 줌에서 총 높이가 세 배 넘게 크게 잡혀
    // 스크롤바가 거짓말을 합니다.
    estimateSize: () => listRowEstimate(uiStore.thumbnailZoom),
    // 높이 0을 캐시하면 스크롤이 맨 위에서 튑니다 (`measuredRowHeight` 참고)
    measureElement: (el, entry) =>
      measuredRowHeight(el, entry, listRowEstimate(uiStore.thumbnailZoom)),
    overscan: 3,
  })),
);

/**
 * 지금 쓰는 virtualizer. 절대 computed로 만들지 말 것.
 *
 * vue-virtual은 스크롤마다 `triggerRef`로 알리는데, Vue 3.4부터 computed는
 * 재계산 결과가 이전과 같으면 알림을 전파하지 않는다. 여기는 늘 같은 인스턴스를
 * 반환하므로 computed로 두면 파생 computed가 첫 값에서 영원히 멈춘다.
 */
const getActiveVirtualizer = () =>
  viewMode.value === "grid" ? gridVirtualizer.value : listVirtualizer.value;

const totalSize = computed(() => getActiveVirtualizer()?.getTotalSize() ?? 0);

/**
 * 지금 뷰의 열 수. 가상 항목 인덱스는 행 번호라 항목 인덱스와 오가려면 어디서든
 * 이 값이 필요하다(보이는 범위, 위치 표시, 스크롤 복원, N번째 이동). 호출부마다
 * 따로 계산하면 한 군데만 빠뜨려도 좌표계가 조용히 어긋난다.
 */
const activeCols = computed(() =>
  viewMode.value === "grid" ? gridMetrics.value.cols : listCols.value,
);

/**
 * 지금 보이는 절대 인덱스 범위. 청크 조회 대상을 정한다. overscan을 포함한
 * getVirtualItems 기준이라, 화면에 표시하는 "몇 번째 보는 중"과는 다른 값이다
 * (그쪽은 virtualizer.range를 쓴다).
 */
const updateVisibleRange = () => {
  const virtualizer = getActiveVirtualizer();
  if (!virtualizer || shownCount.value === 0) return;

  const items = virtualizer.getVirtualItems();
  if (items.length === 0) return;

  const lanes = activeCols.value;
  const firstLocal = items[0].index * lanes;
  const lastLocal = Math.min(
    (items[items.length - 1].index + 1) * lanes - 1,
    shownCount.value - 1,
  );

  visibleAbsRange.value = {
    start: offset.value + firstLocal,
    end: offset.value + lastLocal,
  };
};

// 스크롤바를 크게 던지면 지나치는 모든 구간의 청크를 요청하게 됩니다.
// leading+trailing throttle로 버스트를 눌러 실제로 멈춘 지점만 받습니다.
const scheduleVisibleRangeUpdate = useThrottleFn(updateVisibleRange, 120, true);

watch(
  () => [
    getActiveVirtualizer()?.getVirtualItems().length,
    shownCount.value,
    viewMode.value,
    activeCols.value,
  ],
  () => scheduleVisibleRangeUpdate(),
  { flush: "post" },
);

/**
 * 폭이나 줌이 바뀌면 rowH를 다시 재고 virtualizer에 알린다. estimateSize는 memo
 * 의존성에 없어 값만 바꿔서는 반영되지 않는다. 열 수가 바뀌면 같은 항목의 행
 * 인덱스도 달라지므로 보고 있던 첫 항목 기준으로 다시 스크롤한다.
 */
watch(
  () => ({
    cols: gridMetrics.value.cols,
    rowH: gridMetrics.value.rowHActual,
  }),
  (_next, prev) => {
    const virtualizer = gridVirtualizer.value;
    if (!virtualizer) return;

    // 열 수가 바뀌기 전 기준으로 보고 있던 첫 항목을 계산한다
    const firstLocal = (virtualizer.range?.startIndex ?? 0) * (prev?.cols || 1);

    virtualizer.measure();

    if (viewMode.value === "grid" && firstLocal > 0) {
      const rowIndex = Math.floor(firstLocal / gridMetrics.value.cols);
      requestAnimationFrame(() =>
        virtualizer.scrollToIndex(rowIndex, { align: "start" }),
      );
    }
  },
);

// count나 줌이 바뀌면 캐시된 측정값을 버린다. 안 그러면 옛 높이가 남아 행이
// 겹치거나 벌어진다.
//
// 소스를 `() => [a, b]`로 쓰면 안 된다. 배열 리터럴은 매번 새 참조라 Vue가 항상
// "바뀜"으로 판정해 measure() → 재평가 → 콜백 무한 루프가 된다. getter 배열로
// 넘기면 요소별로 비교한다.
watch(
  [() => listVirtualizer.value?.options.count, () => uiStore.thumbnailZoom],
  () => listVirtualizer.value?.measure(),
);

/**
 * 리스트 열 수가 바뀌면 보던 항목으로 되돌린다. 위 watch가 measure()는 부르지만,
 * 1열 3000행이 2열 1500행이 되면 같은 행 인덱스가 두 배 아래를 가리켜 재측정만
 * 으로는 보던 자리에서 튕긴다.
 */
watch(listCols, (nextCols, prevCols) => {
  const virtualizer = listVirtualizer.value;
  if (!virtualizer || viewMode.value !== "list") return;

  // 열 수가 바뀌기 전 기준으로 보고 있던 첫 항목을 계산한다
  const firstLocal = (virtualizer.range?.startIndex ?? 0) * (prevCols || 1);
  if (firstLocal <= 0) return;

  const rowIndex = Math.floor(firstLocal / nextCols);
  requestAnimationFrame(() =>
    virtualizer.scrollToIndex(rowIndex, { align: "start" }),
  );
});

let resizeObserver: ResizeObserver | null = null;

/**
 * 폭 0은 측정이 아니라 "지금 화면에 없다"는 뜻이라 버린다.
 *
 * keep-alive로 떼어진 동안 스크롤러는 폭 0으로 읽힌다. 그 값을 받으면 열 수가
 * 1로, 행 높이가 6px로 무너지고 virtualizer의 행 번호가 통째로 어긋난다.
 * 돌아올 때 아래 watch가 그 어긋난 번호를 기준으로 다시 스크롤해서, 복원이
 * 제자리에 옮겨놓은 위치를 한참 아래로 덮어쓴다.
 */
const observeScroller = (element: HTMLElement | null) => {
  resizeObserver?.disconnect();
  if (!element) return;

  const readWidth = () => {
    if (element.clientWidth > 0) scrollerWidth.value = element.clientWidth;
  };

  readWidth();
  resizeObserver = new ResizeObserver(() => {
    readWidth();
    scheduleVisibleRangeUpdate();
  });
  resizeObserver.observe(element);
};

watch(scrollerRef, (element) => observeScroller(element), { immediate: true });

// N번째로 이동. 검색 결과가 백만 건 단위라 스크롤만으로는 닿을 수 없다. 목표가
// 현재 구간 안이면 순수 스크롤, 밖이면 구간을 바꾼 뒤 같은 scrollToIndex를 부른다.
const jumpInput = ref("");

/** 결과가 몇만 건일 때 상한을 알 방법이 달리 없어 이 칸에서 알려준다 */
const jumpRangeLabel = computed(
  () => `1–${totalCount.value.toLocaleString("ko-KR")}`,
);

const jumpPlaceholder = computed(() =>
  totalCount.value > 0 ? jumpRangeLabel.value : "번째로 이동",
);

/**
 * 검색 전에는 이동할 결과가 없다. 막지 않으면 눌러도 아무 반응이 없어 사용자가
 * 뭘 잘못했는지 알 수 없다.
 */
const canJump = computed(() => totalCount.value > 0);

const jumpTitle = computed(() =>
  canJump.value
    ? `${jumpRangeLabel.value}번째 중 원하는 위치로 이동합니다`
    : "검색 후 결과 안에서 위치를 이동할 수 있습니다",
);

const handleJump = () => {
  const located = locateNth(Number(jumpInput.value), totalCount.value);
  if (!located) return;

  if (located.page !== currentPage.value) {
    currentPage.value = located.page;
  }
  scrollToIndexWhenReady(located.localIndex);
};

/**
 * 이전·다음 구간으로 옮긴다. 끝을 감지해 자동으로 넘기지 않는 건 스크롤 위치가
 * 맨 위로 튀는 게 미끄러진 것처럼 보이기 때문이다. 구간을 바꾸면 항상 맨 앞부터
 * 본다.
 */
const canGoPrevPage = computed(() => currentPage.value > 0);
const canGoNextPage = computed(() => currentPage.value < pageCount.value - 1);

const movePage = (delta: number) => {
  const next = clampPage(currentPage.value + delta, totalCount.value);
  if (next === currentPage.value) return;

  currentPage.value = next;
  scrollToIndexWhenReady(0);
};

/**
 * 구간을 바꾼 직후에는 바로 scrollToIndex를 부르면 안 된다. 새 count가
 * virtualizer에 반영되기 전이라 목표가 0으로 클램프된다.
 */
let cancelPendingScroll: (() => void) | null = null;

const scrollToIndexWhenReady = (localIndex: number) => {
  cancelPendingScroll?.();
  cancelPendingScroll = runWhenReady(
    () => Boolean(getActiveVirtualizer()) && shownCount.value > localIndex,
    () => {
      const rowIndex = Math.floor(localIndex / activeCols.value);
      getActiveVirtualizer()?.scrollToIndex(rowIndex, { align: "start" });
    },
  );
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

const openDownloadFolder = async () => {
  if (downloadPath.value) {
    await ipcRenderer.invoke("open-folder", downloadPath.value);
  }
};

const handleLanguageChange = async (lang: AcceptableValue) => {
  if (!lang) return;
  downloaderLanguage.value = lang as string;
  await ipcRenderer.invoke("set-config", {
    key: "downloaderLanguage",
    value: lang,
  });
  // 이미 검색한 상태면 즉시 다시 검색합니다.
  // 검색어가 비어 있어도(= 전체 목록) 언어가 바뀌면 결과가 달라집니다.
  // 구독 탭에서는 건너뜁니다. handleSearch가 두 탭이 공유하는 좌표 상태를
  // 되돌려 보고 있던 피드 위치가 날아갑니다
  if (searchKey.value > 0 && !isSubscriptionTab.value) {
    handleSearch();
  }
};

const handlePopularityChange = async (value: AcceptableValue) => {
  if (value === undefined || value === null) return;
  // 센티넬을 저장·조회용 빈 문자열로 되돌립니다
  const next = (value === POPULARITY_ALL ? "" : value) as
    "" | "day" | "week" | "month" | "year";
  downloaderPopularity.value = next;
  await ipcRenderer.invoke("set-config", {
    key: "downloaderPopularity",
    value: next,
  });
  // 언어 변경과 동일하게 즉시 재검색합니다
  if (searchKey.value > 0) {
    handleSearch();
  }
};

const goToSettings = () => {
  router.push({ path: "/settings", query: { tab: "downloader" } });
};

// 위치 표시. 사용자는 이 숫자를 보고 "N번째로 이동"에 넣을 값을 정하므로, 로드한
// 범위가 아니라 지금 뷰포트에 보이는 범위여야 하고 offset을 더해 전체 결과 기준
// 절대 위치로 올려야 한다.
const visiblePosition = computed(() =>
  visibleRange(
    getActiveVirtualizer()?.range ?? null,
    currentPage.value,
    activeCols.value,
    shownCount.value,
  ),
);

/** 결과가 한 구간에 안 들어갈 때만 이전·다음 구간 버튼을 띄운다 */
const showPageBanner = computed(() => pageCount.value > 1);

// 스크롤 복원. 픽셀 오프셋은 못 쓴다 — 열 수가 창 너비와 줌의 함수라 다른
// 화면에 있는 동안 리사이즈하면 같은 픽셀이 다른 항목을 가리킨다. 구간 번호와
// 첫 보이는 항목 인덱스를 저장하고 scrollToIndex로 되돌린다.
useIndexScrollRestoration({
  capture: () => {
    const range = getActiveVirtualizer()?.range;
    if (!range) return null;
    return {
      page: currentPage.value,
      index: range.startIndex * activeCols.value,
    };
  },
  ready: () => Boolean(getActiveVirtualizer()) && shownCount.value > 0,
  restore: (saved) => {
    currentPage.value = clampPage(saved.page, totalCount.value);
    scrollToIndexWhenReady(saved.index);
  },
});

// 검색어 저장/복원
useSearchPersistence(searchQuery, "downloader-search-query");
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <PageHeader icon="solar:download-square-bold-duotone" title="다운로더">
      <template #help>
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
                  icon="solar:filter-bold-duotone"
                  class="inline-block h-4 w-4 align-text-bottom"
                />
                버튼에서 검색할 작품의 언어와 인기 범위를 지정할 수 있습니다.
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
                <code>태그명</code>: 특정 태그가 포함된 작품을 검색합니다. (예:
                <code>female:very_long_hair</code>)
              </li>
              <li>
                <code>-태그명</code>: 특정 태그를 제외하고 검색합니다. (예:
                <code>-female:guro</code>)
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
              <li>
                다운로드 경로는 헤더의 폴더 버튼이나 설정에서 바꿀 수 있습니다.
              </li>
              <li>다운로드 진행 상황은 각 작품 카드에서 확인할 수 있습니다.</li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">차단 태그</h3>
            <ul class="list-inside list-disc">
              <li>
                검색 버튼 옆의 <code>차단 태그</code> 버튼을 눌러 그 자리에서
                등록·해제할 수 있습니다.
              </li>
              <li>
                타입을 생략하면 <code>tag:</code>로 봅니다. (예:
                <code>yaoi</code> → <code>tag:yaoi</code>)
              </li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">미리보기</h3>
            <ul class="list-inside list-disc">
              <li>
                검색 결과에서 작품을 선택한 후 <kbd>V</kbd> 키를 눌러 미리보기
                다이얼로그를 열 수 있습니다.
              </li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">폴더명 패턴</h3>
            <ul class="list-inside list-disc">
              <li>
                <code>%artist|groups%</code>와 같이 Fallback 문법을 사용할 수
                있습니다. (artist가 없으면 groups 사용)
              </li>
            </ul>
          </div>
        </HelpDialog>
      </template>
      <template #actions>
        <!-- 다운로드 경로 칩 -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="outline"
              size="sm"
              :class="
                downloadPath ? '' : 'border-destructive/60 text-destructive'
              "
            >
              <Icon icon="solar:folder-bold-duotone" class="h-4 w-4" />
              <span class="max-w-[260px] truncate font-mono text-xs">
                {{ downloadPath || "다운로드 폴더 미지정" }}
              </span>
              <Icon icon="solar:alt-arrow-down-linear" class="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="openFolderDialog">
              <Icon icon="solar:folder-open-bold-duotone" class="h-4 w-4" />
              경로 변경
            </DropdownMenuItem>
            <DropdownMenuItem
              :disabled="!downloadPath"
              @click="openDownloadFolder"
            >
              <Icon icon="solar:folder-bold-duotone" class="h-4 w-4" />
              폴더 열기
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="secondary" size="icon" @click="goToSettings">
          <Icon icon="solar:settings-bold-duotone" class="h-6 w-6" />
        </Button>
      </template>
    </PageHeader>

    <!-- 검색 / 구독 탭.
         PageToolbar 바깥에 둔다. 그 셸은 Browse·History·Library·SeriesManager와
         공유하므로 슬롯을 늘리면 다른 4개 화면에 영향이 간다 -->
    <Tabs v-model="activeTab" class="shrink-0">
      <TabsList>
        <TabsTrigger value="search">
          <Icon icon="solar:magnifer-bold-duotone" class="h-4 w-4" />
          검색
        </TabsTrigger>
        <TabsTrigger value="subscription" class="relative">
          <Icon icon="solar:feed-bold-duotone" class="h-4 w-4" />
          구독
          <span
            v-if="subscriptionStore.hasUnseen"
            class="bg-destructive ml-1.5 h-2 w-2 rounded-full"
          />
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <!-- 검색바. 구독 탭에서는 #search 슬롯만 갈아끼우고 나머지 슬롯
         (구간 이동·N번째 이동·건수)은 그대로 쓴다 -->
    <PageToolbar>
      <template #search>
        <SubscriptionToolbar
          v-if="isSubscriptionTab"
          :new-count="subscriptionStore.newCount"
          :last-checked-at="subscriptionStore.lastCheckedAt"
          :language="downloaderLanguage"
          :blacklist-count="blacklistTags.length"
          @changed="subscriptionKey++"
          @refresh="refreshSubscriptionFeed"
        />
        <SmartSearchInput
          v-else
          id="search-input"
          v-model="searchQuery"
          placeholder="예: artist:작가명 female:sole_female -female:guro"
          @keyup.enter="handleSearch"
        />
      </template>

      <template #preset>
        <PresetDropdown
          v-if="!isSubscriptionTab"
          v-model="searchQuery"
          @apply-preset="handleSearch"
        />
      </template>

      <!-- 언어는 두 탭이 같은 설정을 씁니다. 인기 범위는 구독에 저장하지 않아
           검색 탭 전용입니다 -->
      <template #filter>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline">
              <Icon icon="solar:filter-bold-duotone" class="h-4 w-4" />
              필터
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-56">
            <DropdownMenuLabel>언어</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              :model-value="downloaderLanguage"
              @update:model-value="handleLanguageChange"
            >
              <DropdownMenuRadioItem
                v-for="lang in languageOptions"
                :key="lang.value"
                :value="lang.value"
              >
                {{ lang.label }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <template v-if="!isSubscriptionTab">
              <DropdownMenuSeparator />
              <!-- 이건 "정렬"이 아니라 인기 목록과의 교집합 필터입니다 -->
              <DropdownMenuLabel>인기 범위</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                :model-value="popularitySelectValue"
                @update:model-value="handlePopularityChange"
              >
                <DropdownMenuRadioItem
                  v-for="opt in popularityOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>

      <template #extra>
        <!-- 다른 화면과 달리 여기만 눌러야 조회가 돕니다. 입력창 값이 아직
             조회에 반영되지 않았으면 버튼에 테를 둘러 알립니다 -->
        <Button
          v-if="!isSubscriptionTab"
          :class="hasPendingSearch ? 'ring-primary/50 ring-2' : ''"
          @click="handleSearch"
        >
          <Icon icon="solar:magnifer-bold-duotone" class="h-5 w-5" />검색
        </Button>
        <!-- 검색과 같은 검색어를 대상으로 하는 동작이라 검색 버튼 옆에 둡니다 -->
        <Button
          v-if="!isSubscriptionTab"
          variant="secondary"
          :disabled="isSubscribing"
          title="현재 검색어를 구독합니다"
          @click="handleSubscribeCurrentSearch"
        >
          <Icon
            :icon="
              isSubscribing
                ? 'svg-spinners:ring-resize'
                : 'solar:feed-bold-duotone'
            "
            class="h-5 w-5"
          />{{ isSubscribing ? "구독 중" : "구독" }}
        </Button>
        <!-- 차단 태그는 구독 폴링에도 걸리므로 구독 탭에서도 보여야 합니다 -->
        <BlacklistTagPopover
          :model-value="blacklistTags"
          @update:model-value="saveBlacklistTags"
        />
      </template>

      <template #view>
        <ViewOptionsBar
          :model-value="viewMode"
          @update:model-value="handleViewModeChange"
        />
      </template>

      <template #status>
        <!-- N번째로 이동 -->
        <!--
          비활성 상태의 title은 툴팁이 안 뜹니다. 브라우저가 disabled 요소에는
          마우스 이벤트를 안 주기 때문입니다. 그래서 감싸는 div가 대신 답니다.
        -->
        <div class="flex items-center gap-1" :title="jumpTitle">
          <Input
            v-model="jumpInput"
            type="number"
            min="1"
            :placeholder="jumpPlaceholder"
            :disabled="!canJump"
            class="h-8 w-32"
            @keyup.enter="handleJump"
          />
          <Button
            variant="outline"
            size="sm"
            class="h-8"
            :disabled="!canJump || !jumpInput"
            @click="handleJump"
          >
            이동
          </Button>
        </div>

        <!-- 이전·다음 구간. 결과가 한 구간을 넘을 때만 나옵니다 -->
        <div v-if="showPageBanner" class="inline-flex h-8 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            class="size-8"
            title="이전 구간"
            :disabled="!canGoPrevPage"
            @click="movePage(-1)"
          >
            <Icon icon="solar:alt-arrow-left-linear" class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="size-8"
            title="다음 구간"
            :disabled="!canGoNextPage"
            @click="movePage(1)"
          >
            <Icon icon="solar:alt-arrow-right-linear" class="h-4 w-4" />
          </Button>
        </div>
      </template>

      <template #count>
        <template v-if="totalCount > 0">
          총 {{ totalCount.toLocaleString("ko-KR") }}건
          <template v-if="visiblePosition">
            중
            <b class="text-foreground">
              {{ visiblePosition.first.toLocaleString("ko-KR") }}–{{
                visiblePosition.last.toLocaleString("ko-KR")
              }}
            </b>
            번째 보는 중
          </template>
        </template>
      </template>
    </PageToolbar>

    <!-- 안내 배너 -->
    <div
      v-if="showPopularityHint"
      class="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
    >
      인기 목록은 전세계 기준이라 언어 필터와 겹치면 결과가 거의 없을 수
      있습니다. 언어를 "전체 언어"로 바꿔보세요.
    </div>

    <div
      v-if="failedDetailCount > 0"
      class="text-destructive border-destructive/50 bg-destructive/10 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
    >
      <span>
        {{ failedDetailCount }}건은 상세 정보를 불러오지 못해 목록에서
        빠졌습니다.
      </span>
      <Button
        variant="outline"
        size="sm"
        class="h-7"
        @click="retryFailedDetails"
      >
        다시 시도
      </Button>
    </div>

    <!-- 결과 -->
    <!-- scrollbar-gutter: 총 높이가 0→수백만으로 뛰며 스크롤바가 생기는 순간
       clientWidth가 15px 줄어듭니다. 컬럼 경계 근처면
       cols→rowH→총높이→스크롤바 순환이 발생합니다 -->
    <div
      ref="scrollerRef"
      class="downloader-scroller relative min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto rounded-lg border p-2"
      @scroll="scheduleVisibleRangeUpdate"
    >
      <!-- 로딩: 스켈레톤 -->
      <div v-if="isLoading">
        <div
          v-if="viewMode === 'grid'"
          class="grid gap-4"
          :style="downloaderGridStyle"
        >
          <div
            v-for="n in 12"
            :key="n"
            class="bg-muted aspect-3/4 animate-pulse rounded-lg"
          ></div>
        </div>
        <div v-else class="flex flex-col gap-2">
          <div
            v-for="n in 6"
            :key="n"
            class="bg-muted h-64 animate-pulse rounded-lg"
          ></div>
        </div>
      </div>

      <!-- 오류 -->
      <div
        v-else-if="isError"
        class="text-destructive flex h-full flex-col items-center justify-center gap-2"
      >
        <Icon icon="solar:danger-triangle-bold-duotone" class="h-8 w-8" />
        <p v-if="isSubscriptionTab">
          구독 목록을 불러오지 못했습니다: {{ error?.message }}
        </p>
        <p v-else>검색에 실패했습니다: {{ error?.message }}</p>
        <Button
          variant="outline"
          size="sm"
          @click="
            isSubscriptionTab ? refreshSubscriptionFeed() : handleSearch()
          "
        >
          다시 시도
        </Button>
      </div>

      <!-- 결과 목록 (가상 스크롤) -->
      <!-- .vspace는 zoom 바깥, 카드만 .zoomed-grid 안. 스페이서를 zoom
         안으로 옮기면 렌더 높이가 총높이 × z가 되어 뒤쪽에 도달할 수 없습니다 -->
      <div
        v-else-if="shownCount > 0"
        class="vspace relative w-full"
        :style="{ height: `${totalSize}px` }"
      >
        <!-- 그리드: 행 단위 가상화 + zoom 좌표 환산 -->
        <div
          v-if="viewMode === 'grid'"
          class="zoomed-grid absolute inset-x-0 top-0"
          :style="{ zoom: uiStore.thumbnailZoom }"
          @wheel="handleZoomWheel"
        >
          <div
            v-for="row in gridVirtualizer?.getVirtualItems() ?? []"
            :key="row.index"
            class="absolute inset-x-0 grid"
            :style="{
              transform: `translateY(${row.start / uiStore.thumbnailZoom}px)`,
              gridTemplateColumns: `repeat(${gridMetrics.cols}, minmax(0, 1fr))`,
              gap: `${16}px`,
            }"
          >
            <template
              v-for="col in gridMetrics.cols"
              :key="`${row.index}-${col}`"
            >
              <GalleryThumbnailCard
                v-if="itemAt(row.index * gridMetrics.cols + col - 1)"
                :gallery="itemAt(row.index * gridMetrics.cols + col - 1)!"
                :download-status="
                  downloadStatuses[
                    itemAt(row.index * gridMetrics.cols + col - 1)!.id
                  ]
                "
                :book-id="
                  resolveBookId(
                    itemAt(row.index * gridMetrics.cols + col - 1)!.id,
                  )
                "
                :download-path="downloadPath"
                :selected="
                  selectedGallery?.id ===
                  itemAt(row.index * gridMetrics.cols + col - 1)!.id
                "
                @select-gallery="handleSelectGallery"
                @preview-gallery="
                  (gallery) => {
                    handleSelectGallery(gallery);
                    isPreviewDialogOpen = true;
                  }
                "
                @request-delete="requestDelete"
              />
              <!-- 아직 청크가 안 온 자리. 높이를 잡아둬야 행이 안 무너집니다 -->
              <div
                v-else-if="row.index * gridMetrics.cols + col - 1 < shownCount"
                class="bg-muted aspect-3/4 animate-pulse rounded-lg"
              ></div>
            </template>
          </div>
        </div>

        <!-- 리스트: 행 단위 가상화 + 동적 측정 (CSS zoom 없음).
           측정 대상은 행 래퍼다. 2열이면 두 카드 중 높은 쪽이 행 높이가 되는데
           래퍼 하나만 재면 저절로 맞는다 -->
        <div v-else class="absolute inset-x-0 top-0" @wheel="handleZoomWheel">
          <div
            v-for="virtualRow in listVirtualizer?.getVirtualItems() ?? []"
            :key="virtualRow.index"
            :ref="(el) => listVirtualizer?.measureElement(el as Element)"
            :data-index="virtualRow.index"
            class="absolute inset-x-0 grid pb-2"
            :style="{
              transform: `translateY(${virtualRow.start}px)`,
              gridTemplateColumns: `repeat(${listCols}, minmax(0, 1fr))`,
              gap: `${LIST_GAP}px`,
            }"
          >
            <template
              v-for="col in listCols"
              :key="`${virtualRow.index}-${col}`"
            >
              <GalleryRowCard
                v-if="itemAt(virtualRow.index * listCols + col - 1)"
                :gallery="itemAt(virtualRow.index * listCols + col - 1)!"
                :download-status="
                  downloadStatuses[
                    itemAt(virtualRow.index * listCols + col - 1)!.id
                  ]
                "
                :book-id="
                  resolveBookId(
                    itemAt(virtualRow.index * listCols + col - 1)!.id,
                  )
                "
                :download-path="downloadPath"
                :selected="
                  selectedGallery?.id ===
                  itemAt(virtualRow.index * listCols + col - 1)!.id
                "
                @select-gallery="handleSelectGallery"
                @preview-gallery="
                  (gallery) => {
                    handleSelectGallery(gallery);
                    isPreviewDialogOpen = true;
                  }
                "
                @request-delete="requestDelete"
              />
              <!-- 아직 청크가 안 온 자리. 마지막 행의 빈 칸에는 안 깔립니다 -->
              <div
                v-else-if="virtualRow.index * listCols + col - 1 < shownCount"
                class="bg-muted h-64 animate-pulse rounded-lg"
              ></div>
            </template>
          </div>
        </div>
      </div>

      <!-- 검색 전 -->
      <div
        v-else-if="!isSourceReady"
        class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center"
      >
        <Icon icon="solar:magnifer-bold-duotone" class="h-10 w-10 opacity-40" />
        <p>검색어를 입력하고 검색을 눌러주세요.</p>
        <p class="text-xs">
          검색어를 비우고 검색하면 해당 언어의 전체 목록을 볼 수 있습니다.
        </p>
      </div>

      <!-- 결과 0건 -->
      <div
        v-else
        class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center"
      >
        <Icon
          icon="solar:file-remove-bold-duotone"
          class="h-10 w-10 opacity-40"
        />
        <template v-if="isSubscriptionTab">
          <p v-if="subscriptionStore.subscriptionCount === 0">
            구독한 검색어가 없습니다.
          </p>
          <p v-else>구독한 작품이 없습니다.</p>
          <p class="text-xs">
            검색 탭에서 검색어를 정한 뒤 종 모양 버튼으로 구독할 수 있습니다.
          </p>
        </template>
        <template v-else>
          <p>검색 결과가 없습니다.</p>
          <p v-if="blacklistTags.length > 0" class="text-xs">
            차단 태그 {{ blacklistTags.length }}개가 적용 중입니다.
          </p>
        </template>
      </div>
    </div>
  </div>

  <GalleryPreviewDialog
    :open="isPreviewDialogOpen"
    :gallery="selectedGallery"
    @update:open="isPreviewDialogOpen = $event"
  />

  <!-- 검색어를 비운 채 구독하면 언어 전체가 구독된다. 의도한 경우가 드물어 확인한다 -->
  <AlertDialog
    :open="isSubscribeConfirmOpen"
    @update:open="isSubscribeConfirmOpen = $event"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>언어 전체를 구독할까요?</AlertDialogTitle>
        <AlertDialogDescription>
          검색어가 비어 있어
          <strong>{{ finalSearchQuery || "전체" }}</strong>
          로 구독됩니다. 해당 언어의 모든 신작이 목록에 들어옵니다.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction
          @click="
            isSubscribeConfirmOpen = false;
            subscribeToQuery(finalSearchQuery);
          "
        >
          구독하기
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <!-- 삭제 확인 다이얼로그.
       카드가 아니라 여기 있는 이유: 카드에 두면 다이얼로그를 연 채 스크롤할 때
       그 카드가 언마운트되며 다이얼로그까지 사라집니다. Reka UI가 잠그는 건
       body 스크롤인데 여기 스크롤러는 내부 div라 스크롤이 안 막힙니다. -->
  <AlertDialog
    :open="isDeleteDialogOpen"
    @update:open="isDeleteDialogOpen = $event"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>책을 삭제하시겠습니까?</AlertDialogTitle>
        <AlertDialogDescription>
          {{
            permanentDelete
              ? "데이터베이스에서 책 정보가 삭제되고, 파일이 영구적으로 삭제됩니다."
              : "데이터베이스에서 책 정보가 삭제되고, 파일은 휴지통으로 이동합니다."
          }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Label class="flex cursor-pointer items-center gap-2 font-normal">
        <Checkbox v-model="permanentDelete" />
        휴지통을 거치지 않고 영구 삭제
      </Label>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction @click="confirmDelete">삭제</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
