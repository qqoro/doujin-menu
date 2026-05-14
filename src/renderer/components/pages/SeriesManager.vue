<script setup lang="ts">
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useQueryAndParams } from "@/composable/useQueryAndParams";
import { useScrollRestoration } from "@/composable/useScrollRestoration";
import { Icon } from "@iconify/vue";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import type { AcceptableValue } from "reka-ui";
import { debouncedRef, debouncedWatch } from "@vueuse/core";
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import type {
  SeriesCollection,
  SeriesCollectionWithBooks,
} from "../../../main/db/types";
import {
  deleteSeriesCollection,
  getSeriesCollections,
  ipcRenderer,
  runSeriesDetection,
} from "../../api";
import CreateSeriesDialog from "../feature/CreateSeriesDialog.vue";
import SeriesCollectionCard from "../feature/SeriesCollectionCard.vue";
import SeriesCollectionRowCard from "../feature/SeriesCollectionRowCard.vue";
import SeriesDetailDialog from "../feature/SeriesDetailDialog.vue";
import SeriesDetectionDialog from "../feature/SeriesDetectionDialog.vue";

const queryClient = useQueryClient();
const route = useRoute();

// 무한 스크롤 IntersectionObserver용 로더 ref
const loader = ref<HTMLElement | null>(null);

// 필터 및 정렬 상태 (URL 동기화)
const filterType = ref<"all" | "auto" | "manual">("all");
const sortBy = ref<"name" | "book_count" | "confidence" | "created_at">("name");
const sortOrder = ref<"asc" | "desc">("asc");

// 뷰 모드 (URL에 저장하지 않고 config에만 저장)
const viewMode = ref<"grid" | "list">("grid");

// ToggleGroup의 선택 해제 방지
const handleViewModeChange = (value: AcceptableValue | AcceptableValue[]) => {
  if (
    value &&
    typeof value === "string" &&
    (value === "grid" || value === "list")
  ) {
    viewMode.value = value;
  }
};

// URL 쿼리 파라미터와 상태 동기화
const { schWord: searchQuery } = useQueryAndParams({
  queries: { filterType, sortBy, sortOrder },
  defaultOptions: { filterType: "all", sortBy: "name", sortOrder: "asc" },
});

// 검색어 debounce 적용 (API 호출 최적화)
const debouncedSearchQuery = debouncedRef(searchQuery, 300);

// 설정 로드
const { data: config, isSuccess: isConfigLoaded } = useQuery({
  queryKey: ["config"],
  queryFn: () => ipcRenderer.invoke("get-config"),
});

// 설정 초기화 완료 여부를 추적하는 플래그
const isSettingsInitialized = ref(false);

// 설정을 로드하는 공통 함수
const loadSettings = () => {
  if (config.value && config.value.seriesViewSettings) {
    const settings = config.value.seriesViewSettings as {
      sortBy: string;
      sortOrder: "asc" | "desc";
      viewMode: "grid" | "list";
    };
    const query = route.query;

    // 각 파라미터를 개별적으로 확인하여 URL 쿼리에 없는 것만 설정에서 불러옴
    if (!query.sortBy) {
      sortBy.value = settings.sortBy as typeof sortBy.value;
    }
    if (!query.sortOrder) {
      sortOrder.value = settings.sortOrder;
    }
    // viewMode는 URL 쿼리에 포함되지 않으므로 항상 설정에서 불러옴
    viewMode.value = settings.viewMode || "grid";

    // 설정 적용 완료 후 다음 틱에서 플래그 설정 (이후 변경부터 저장)
    nextTick(() => {
      isSettingsInitialized.value = true;
    });
  }
};

// 설정이 로드되면 초기값 적용
watch(
  isConfigLoaded,
  (loaded) => {
    if (loaded) {
      loadSettings();
    }
  },
  { immediate: true },
);

// 다른 페이지로 이동할 때 설정 저장 방지
onDeactivated(() => {
  isSettingsInitialized.value = false;
});

// keep-alive로 인해 다른 페이지에서 돌아올 때 설정 다시 로드
onActivated(() => {
  isSettingsInitialized.value = false;
  if (isConfigLoaded.value) {
    loadSettings();
  }
});

// 필터/정렬/뷰모드 변경 시 설정 저장
debouncedWatch(
  [sortBy, sortOrder, viewMode],
  async () => {
    // 설정이 초기화되기 전의 변경은 저장하지 않음
    if (!isConfigLoaded.value || !isSettingsInitialized.value) return;

    const settings = {
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      viewMode: viewMode.value,
    };
    await ipcRenderer.invoke("set-config", {
      key: "seriesViewSettings",
      value: settings,
    });
    // 설정 저장 후 config 쿼리 캐시 무효화하여 최신 값 반영
    queryClient.invalidateQueries({ queryKey: ["config"] });
  },
  { debounce: 1000 },
);

// 다이얼로그 상태
const showDetectionDialog = ref(false);
const showDetailDialog = ref(false);
const showCreateDialog = ref(false);
const showDeleteDialog = ref(false);
const selectedSeries = ref<SeriesCollectionWithBooks | null>(null);
const seriesToDelete = ref<number | null>(null);

// 무한 쿼리 키
const queryKey = computed(
  () =>
    [
      "seriesCollections",
      {
        searchQuery: debouncedSearchQuery.value,
        filterType: filterType.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
      },
    ] as const,
);

// 시리즈 컬렉션 무한 스크롤 조회
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  refetch,
} = useInfiniteQuery({
  queryKey,
  queryFn: async ({ pageParam = 0 }) => {
    return await getSeriesCollections({
      pageParam,
      pageSize: 50,
      searchQuery: debouncedSearchQuery.value,
      filterType: filterType.value as "all" | "auto" | "manual",
      sortBy: sortBy.value as
        | "name"
        | "book_count"
        | "confidence"
        | "created_at",
      sortOrder: sortOrder.value,
    });
  },
  getNextPageParam: (lastPage) =>
    lastPage.hasNextPage ? lastPage.nextPage : undefined,
  initialPageParam: 0,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
});

// 컬렉션 목록 및 전체 카운트
const collections = computed(
  () => data.value?.pages.flatMap((page) => page.collections) ?? [],
);
const totalCount = computed(() => {
  const pages = data.value?.pages;
  if (!pages || pages.length === 0) return 0;
  return pages[pages.length - 1]?.pagination?.totalCount || 0;
});

// IPC 이벤트 수신 - 시리즈 컬렉션 업데이트 시 쿼리 무효화
onMounted(() => {
  ipcRenderer.on("series-collections-updated", () =>
    queryClient.invalidateQueries({ queryKey: ["seriesCollections"] }),
  );
});

// keep-alive로 캐시된 컴포넌트가 활성화될 때 쿼리 다시 불러오기
onActivated(() => {
  refetch();
});

// 무한 스크롤 IntersectionObserver
const observer = shallowRef<IntersectionObserver>();
watch(loader, (newLoaderEl) => {
  observer.value?.disconnect();
  observer.value = new IntersectionObserver((entries) => {
    if (
      entries[0].isIntersecting &&
      hasNextPage.value &&
      !isFetchingNextPage.value
    ) {
      fetchNextPage();
    }
  });

  if (newLoaderEl) {
    observer.value.observe(newLoaderEl);
  }
});

// 자동 감지 실행 뮤테이션
const detectionMutation = useMutation({
  mutationFn: runSeriesDetection,
  onSuccess: (result) => {
    if (result) {
      toast.success(
        `자동 감지 완료: ${result.created_count}개 시리즈 생성 (${result.processed_books}권 처리)`,
      );
    }
    queryClient.invalidateQueries({ queryKey: ["seriesCollections"] });
  },
  onError: (error) => {
    toast.error(`자동 감지 실패: ${error.message}`);
  },
});

// 시리즈 삭제 뮤테이션
const deleteMutation = useMutation({
  mutationFn: deleteSeriesCollection,
  onSuccess: () => {
    toast.success("시리즈가 삭제되었습니다");
    queryClient.invalidateQueries({ queryKey: ["seriesCollections"] });
  },
  onError: (error) => {
    toast.error(`삭제 실패: ${error.message}`);
  },
});

// 자동 감지 다이얼로그 열기
const handleRunDetection = () => {
  showDetectionDialog.value = true;
};

// 자동 감지 확정 실행
const handleConfirmDetection = (options: {
  minConfidence: number;
  minBooks: number;
}) => {
  showDetectionDialog.value = false;
  detectionMutation.mutate(options);
};

// 시리즈 클릭 → 상세 다이얼로그
const handleSeriesClick = (series: SeriesCollection) => {
  selectedSeries.value = series as SeriesCollectionWithBooks;
  showDetailDialog.value = true;
};

// 시리즈 삭제 요청
const handleDeleteSeries = (seriesId: number) => {
  seriesToDelete.value = seriesId;
  showDeleteDialog.value = true;
};

// 시리즈 삭제 확정
const confirmDelete = () => {
  if (seriesToDelete.value !== null) {
    deleteMutation.mutate(seriesToDelete.value);
    seriesToDelete.value = null;
  }
  showDeleteDialog.value = false;
};

// 정렬 기준 설정
const setSortBy = (column: string) => {
  sortBy.value = column as "name" | "book_count" | "confidence" | "created_at";
};

// 정렬 순서 토글
const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
};

// 스크롤 위치 복원
useScrollRestoration(".flex-grow.overflow-y-auto");
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 헤더 -->
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Icon icon="solar:library-bold-duotone" class="h-6 w-6" />
        <h2 class="text-2xl font-bold">시리즈</h2>
        <HelpDialog
          title="시리즈 도움말"
          description="시리즈 관리 사용법 및 자동 감지 팁"
        >
          <template #trigger>
            <Button variant="ghost" size="icon">
              <Icon icon="solar:question-circle-bold-duotone" class="h-6 w-6" />
            </Button>
          </template>
          <div class="text-muted-foreground space-y-4 text-sm">
            <p>이 화면에서는 시리즈를 관리하고 열람할 수 있습니다.</p>
            <h3 class="text-foreground text-base font-semibold">자동 감지</h3>
            <ul class="list-inside list-disc">
              <li>
                제목 패턴, 작가, 태그 등을 분석하여 시리즈를 자동으로
                감지합니다.
              </li>
              <li>
                자동 감지 실행 시 기존 자동 생성 시리즈는 삭제되고 다시
                인식됩니다.
              </li>
              <li>수동으로 편집한 시리즈는 자동 감지에서 보호됩니다.</li>
              <li>신뢰도 점수를 참고하여 감지 결과를 확인하세요.</li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">시리즈 관리</h3>
            <ul class="list-inside list-disc">
              <li>시리즈 카드를 클릭하여 상세 정보를 확인할 수 있습니다.</li>
              <li>상세 화면에서 시리즈명, 설명 등을 수정할 수 있습니다.</li>
              <li>시리즈에 속한 책들의 순서를 조정할 수 있습니다.</li>
              <li>필요 없는 시리즈는 삭제할 수 있습니다.</li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">
              필터 및 정렬
            </h3>
            <ul class="list-inside list-disc">
              <li>자동 생성/수동 생성 시리즈를 필터링할 수 있습니다.</li>
              <li>
                이름, 생성일, 도서 수, 신뢰도 기준으로 정렬할 수 있습니다.
              </li>
            </ul>
          </div>
        </HelpDialog>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="showCreateDialog = true">
          <Icon icon="solar:add-circle-bold-duotone" class="mr-2 h-4 w-4" />
          새 시리즈
        </Button>
        <Button
          :disabled="detectionMutation.isPending.value"
          @click="handleRunDetection"
        >
          <Icon icon="solar:magic-stick-3-bold-duotone" class="mr-2 h-4 w-4" />
          자동 감지 실행
        </Button>
      </div>
    </div>

    <!-- 검색 및 필터 영역 -->
    <div class="mb-4 flex items-center gap-2">
      <Select v-model="filterType">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="필터 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          <SelectItem value="auto">자동 생성만</SelectItem>
          <SelectItem value="manual">수동 생성만</SelectItem>
        </SelectContent>
      </Select>
      <SmartSearchInput
        v-model="searchQuery"
        placeholder="시리즈명, 작가, 태그, 타입으로 검색"
        class="flex-grow"
      />
      <div class="inline-flex">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="rounded-r-none">
              <Icon icon="solar:sort-bold-duotone" class="h-4 w-4" />
              정렬
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>정렬 기준</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="setSortBy('name')">
              이름순
              <Icon
                v-if="sortBy === 'name'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('created_at')">
              생성일순
              <Icon
                v-if="sortBy === 'created_at'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('book_count')">
              도서 수순
              <Icon
                v-if="sortBy === 'book_count'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('confidence')">
              신뢰도순
              <Icon
                v-if="sortBy === 'confidence'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          class="rounded-l-none border-l-0"
          @click="toggleSortOrder"
        >
          <Icon
            v-if="sortOrder === 'asc'"
            icon="solar:sort-from-bottom-to-top-bold-duotone"
            class="h-4 w-4"
          />
          <Icon
            v-else
            icon="solar:sort-from-top-to-bottom-bold-duotone"
            class="h-4 w-4"
          />
        </Button>
      </div>
      <ToggleGroup
        :model-value="viewMode"
        type="single"
        @update:model-value="handleViewModeChange"
      >
        <ToggleGroupItem value="grid" aria-label="그리드 뷰">
          <Icon icon="solar:widget-4-bold-duotone" class="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="리스트 뷰">
          <Icon icon="solar:list-bold-duotone" class="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
      <div class="text-muted-foreground text-sm">
        총 {{ totalCount }}개 시리즈
      </div>
    </div>

    <!-- 로딩 중 -->
    <div
      v-if="isLoading"
      class="flex flex-grow flex-col items-center justify-center text-center"
    >
      <div
        class="text-muted-foreground mb-4 flex flex-col items-center justify-center gap-2 text-lg"
      >
        <Icon icon="svg-spinners:ring-resize" class="size-8" />
        <p>로딩중...</p>
      </div>
    </div>

    <!-- 그리드 뷰 -->
    <div
      v-else-if="collections.length > 0 && viewMode === 'grid'"
      class="grid flex-grow grid-cols-1 items-start gap-4 overflow-y-auto sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
    >
      <SeriesCollectionCard
        v-for="series in collections"
        :key="series.id"
        :series="series"
        @click="handleSeriesClick(series)"
        @delete="handleDeleteSeries(series.id)"
      />
      <div
        v-if="hasNextPage"
        ref="loader"
        class="col-span-full p-4 text-center"
      >
        <Button :disabled="isFetchingNextPage" @click="fetchNextPage">
          <Icon v-if="isFetchingNextPage" icon="svg-spinners:ring-resize" />
          <span>더 불러오기</span>
        </Button>
      </div>
    </div>

    <!-- 리스트 뷰 -->
    <div
      v-else-if="collections.length > 0 && viewMode === 'list'"
      class="flex flex-grow flex-col gap-2 overflow-y-auto"
    >
      <SeriesCollectionRowCard
        v-for="series in collections"
        :key="series.id"
        :series="series"
        @click="handleSeriesClick(series)"
        @delete="handleDeleteSeries(series.id)"
      />
      <div v-if="hasNextPage" ref="loader" class="p-4 text-center">
        <Button :disabled="isFetchingNextPage" @click="fetchNextPage">
          <Icon v-if="isFetchingNextPage" icon="svg-spinners:ring-resize" />
          <span>더 불러오기</span>
        </Button>
      </div>
    </div>

    <!-- 빈 상태 - 검색 결과 없음 -->
    <div
      v-else-if="searchQuery.trim().length > 0"
      class="flex flex-grow flex-col items-center justify-center text-center"
    >
      <div
        class="text-muted-foreground mb-4 flex flex-col items-center justify-center gap-2 text-lg"
      >
        <p>검색된 데이터가 없습니다.</p>
      </div>
    </div>

    <!-- 빈 상태 - 시리즈 없음 -->
    <div
      v-else
      class="flex flex-grow flex-col items-center justify-center text-center"
    >
      <div
        class="text-muted-foreground mb-4 flex flex-col items-center justify-center gap-2 text-lg"
      >
        <Icon icon="solar:library-bold-duotone" class="h-16 w-16" />
        <div>
          <h3 class="text-lg font-semibold">시리즈가 없습니다</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            자동 감지를 실행하여 시리즈를 생성하세요
          </p>
        </div>
        <Button @click="handleRunDetection">
          <Icon icon="solar:magic-stick-3-bold-duotone" class="mr-2 h-4 w-4" />
          자동 감지 실행
        </Button>
      </div>
    </div>

    <!-- 자동 감지 다이얼로그 -->
    <SeriesDetectionDialog
      v-model:open="showDetectionDialog"
      @confirm="handleConfirmDetection"
    />

    <!-- 시리즈 상세 다이얼로그 -->
    <SeriesDetailDialog
      v-model:open="showDetailDialog"
      :series="selectedSeries"
      @updated="refetch"
    />

    <!-- 새 시리즈 만들기 다이얼로그 -->
    <CreateSeriesDialog v-model:open="showCreateDialog" @created="refetch" />

    <!-- 시리즈 삭제 확인 다이얼로그 -->
    <AlertDialog
      :open="showDeleteDialog"
      @update:open="showDeleteDialog = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>시리즈 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            정말 이 시리즈를 삭제하시겠습니까? 시리즈에 속한 책들은 시리즈에서
            제거되지만 책 자체는 삭제되지 않습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction @click="confirmDelete">삭제</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
