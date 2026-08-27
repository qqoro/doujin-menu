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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryAndParams } from "@/composables/useQueryAndParams";
import { useVirtualCardList } from "@/composables/useVirtualCardList";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import AppliedFilterChips from "../common/AppliedFilterChips.vue";
import SortMenu from "../common/SortMenu.vue";
import ViewOptionsBar from "../common/ViewOptionsBar.vue";
import PageHeader from "../layout/PageHeader.vue";
import PageToolbar from "../layout/PageToolbar.vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { debouncedRef, debouncedWatch } from "@vueuse/core";
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import {
  deleteSeriesCollection,
  getSeriesCollections,
  ipcRenderer,
  runSeriesDetection,
  type SeriesCollectionPage,
} from "../../api";
import CreateSeriesDialog from "../feature/CreateSeriesDialog.vue";
import SeriesCollectionCard from "../feature/SeriesCollectionCard.vue";
import SeriesCollectionRowCard from "../feature/SeriesCollectionRowCard.vue";
import SeriesDetailDialog from "../feature/SeriesDetailDialog.vue";
import SeriesDetectionDialog from "../feature/SeriesDetectionDialog.vue";

const queryClient = useQueryClient();
const route = useRoute();
const uiStore = useUiStore();

/** 목록 한 칸에 들어가는 시리즈. book_count가 붙어 있어 DB 타입과 다르다 */
type SeriesListItem = SeriesCollectionPage["collections"][number];

// 필터 및 정렬 상태 (URL 동기화)
const filterType = ref<"all" | "auto" | "manual">("all");
const sortBy = ref<"name" | "book_count" | "confidence_score" | "created_at">(
  "name",
);
const sortOrder = ref<"asc" | "desc">("asc");

// 뷰 모드 (URL에 저장하지 않고 config에만 저장)
const viewMode = ref<"grid" | "list">("grid");

// URL 쿼리 파라미터와 상태 동기화
const { schWord: searchQuery } = useQueryAndParams({
  queries: { filterType, sortBy, sortOrder },
  defaultOptions: { filterType: "all", sortBy: "name", sortOrder: "asc" },
});

// 정렬 메뉴에 띄울 순서
const sortOptions = [
  { value: "name", label: "이름순" },
  { value: "created_at", label: "생성일순" },
  { value: "book_count", label: "도서 수순" },
  { value: "confidence_score", label: "신뢰도순" },
];

const FILTER_TYPE_LABELS: Record<string, string> = {
  auto: "자동 생성만",
  manual: "수동 생성만",
};

// 지금 걸려 있는 조건. 라이브러리와 같은 이유로 눈에 보여야 한다
const appliedFilters = computed(() => {
  const result: { key: string; label: string }[] = [];

  const trimmed = searchQuery.value.trim();
  if (trimmed !== "") {
    result.push({ key: "searchQuery", label: `검색: ${trimmed}` });
  }
  if (filterType.value !== "all") {
    result.push({
      key: "filterType",
      label: FILTER_TYPE_LABELS[filterType.value] ?? filterType.value,
    });
  }

  return result;
});

const clearFilterByKey = (key: string) => {
  if (key === "searchQuery") searchQuery.value = "";
  if (key === "filterType") filterType.value = "all";
};

const clearAllFilters = () => {
  searchQuery.value = "";
  filterType.value = "all";
};

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
const selectedSeries = ref<SeriesListItem | null>(null);
const seriesToDelete = ref<number | null>(null);

// 조회 조건. 바뀌면 청크 캐시 키가 통째로 갈린다
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

/** 청크 하나에 담는 시리즈 수. 기존 get-series-collections pageSize와 같다 */
const CHUNK_SIZE = 50;

// 배치·줌·스크롤 복원은 useVirtualCardList가 담당한다. 여기는 데이터를 어떻게
// 가져올지만 알려준다
const {
  scrollerRef,
  updateVisibleRange,
  handleZoomWheel,
  gridVirtualizer,
  listVirtualizer,
  gridCols,
  listCols,
  totalSize,
  totalCount,
  isLoading,
  itemAt,
  GRID_GAP,
  LIST_GAP,
  listSkeletonHeight,
} = useVirtualCardList<SeriesListItem>({
  viewMode,
  chunkSize: CHUNK_SIZE,
  // 1건만 요청해 총 건수만 확보한다 (스크롤러 총 높이용)
  fetchTotal: async () => {
    const result = await getSeriesCollections({
      ...queryKey.value[1],
      pageParam: 0,
      pageSize: 1,
    });
    return result.pagination?.totalCount ?? 0;
  },
  fetchChunk: async (chunkIndex) => {
    const result = await getSeriesCollections({
      ...queryKey.value[1],
      pageParam: chunkIndex,
      pageSize: CHUNK_SIZE,
    });
    return result.collections;
  },
  metaKey: () => ["seriesCollections-meta", queryKey.value[1]],
  chunkKey: (chunkIndex) => [
    "seriesCollections",
    queryKey.value[1],
    chunkIndex,
  ],
  // 조건이 바뀌면 새 키의 청크를 받아 다시 그려야 하므로 스켈레톤 상태로 돌린다
  resetKey: () => queryKey.value[1],
});

/** 목록을 처음부터 다시 받는다. 총 건수 메타도 같이 갈아야 스크롤러 높이가 맞는다 */
const refetchCollections = () => {
  queryClient.invalidateQueries({ queryKey: ["seriesCollections"] });
  queryClient.invalidateQueries({ queryKey: ["seriesCollections-meta"] });
};

// IPC 이벤트 수신 - 시리즈 컬렉션 업데이트 시 쿼리 무효화
onMounted(() => {
  ipcRenderer.on("series-collections-updated", refetchCollections);
});

onUnmounted(() => {
  ipcRenderer.off("series-collections-updated", refetchCollections);
});

// keep-alive로 캐시된 컴포넌트가 활성화될 때 쿼리 다시 불러오기
onActivated(() => {
  refetchCollections();
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
const handleSeriesClick = (series: SeriesListItem) => {
  selectedSeries.value = series;
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
  sortBy.value = column as
    | "name"
    | "book_count"
    | "confidence_score"
    | "created_at";
};
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <!-- 헤더 -->
    <PageHeader icon="solar:library-bold-duotone" title="시리즈">
      <template #help>
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
      </template>
      <template #actions>
        <Button variant="outline" @click="showCreateDialog = true">
          <Icon icon="solar:add-circle-bold-duotone" class="h-4 w-4" />
          새 시리즈
        </Button>
        <Button
          :disabled="detectionMutation.isPending.value"
          @click="handleRunDetection"
        >
          <Icon icon="solar:magic-stick-3-bold-duotone" class="h-4 w-4" />
          자동 감지 실행
        </Button>
      </template>
    </PageHeader>

    <!-- 콘텐츠 -->
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <!-- 검색 및 필터 영역 -->
      <PageToolbar>
        <template #search>
          <SmartSearchInput
            v-model="searchQuery"
            placeholder="시리즈명, 작가, 태그, 타입으로 검색"
          />
        </template>

        <template #filter>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline">
                <Icon icon="solar:filter-bold-duotone" class="h-4 w-4" />
                필터
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-56">
              <DropdownMenuLabel>생성 방식</DropdownMenuLabel>
              <DropdownMenuRadioGroup v-model="filterType">
                <DropdownMenuRadioItem value="all">전체</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="auto">
                  자동 생성만
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="manual">
                  수동 생성만
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>

        <template #sort>
          <SortMenu
            :options="sortOptions"
            :sort-by="sortBy"
            :sort-order="sortOrder"
            @update:sort-by="setSortBy"
            @update:sort-order="sortOrder = $event"
          />
        </template>

        <template #view>
          <ViewOptionsBar v-model="viewMode" />
        </template>

        <template #status>
          <AppliedFilterChips
            :filters="appliedFilters"
            @clear="clearFilterByKey"
            @clear-all="clearAllFilters"
          />
        </template>

        <template #count>
          총 {{ totalCount.toLocaleString("ko-KR") }}개 시리즈
        </template>
      </PageToolbar>

      <!-- 목록 (가상 스크롤)
           스크롤러는 항상 마운트해야 한다. 조건부로 두면 virtualizer가 초기화
           시점에 스크롤 요소를 못 잡아 행이 하나도 안 그려진다.
           .vspace는 zoom 바깥, 카드만 행 안쪽 .zoomed에 들어간다 -->
      <div
        ref="scrollerRef"
        class="series-scroller relative min-h-0 flex-grow overflow-y-auto"
        @wheel="handleZoomWheel"
        @scroll="updateVisibleRange"
      >
        <div
          v-if="isLoading"
          class="flex h-full flex-col items-center justify-center text-center"
        >
          <div
            class="text-muted-foreground mb-4 flex flex-col items-center justify-center gap-2 text-lg"
          >
            <Icon icon="svg-spinners:ring-resize" class="size-8" />
            <p>로딩중...</p>
          </div>
        </div>
        <div
          v-else-if="totalCount > 0"
          class="vspace relative w-full"
          :style="{ height: `${totalSize}px` }"
        >
          <!-- 그리드 -->
          <template v-if="viewMode === 'grid'">
            <div
              v-for="row in gridVirtualizer?.getVirtualItems() ?? []"
              :key="row.index"
              :ref="(el) => gridVirtualizer?.measureElement(el as Element)"
              :data-index="row.index"
              class="absolute inset-x-0 top-0"
              :style="{ transform: `translateY(${row.start}px)` }"
            >
              <div
                class="zoomed grid items-start"
                :style="{
                  zoom: uiStore.thumbnailZoom,
                  gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                  gap: `${GRID_GAP}px`,
                  paddingBottom: `${GRID_GAP}px`,
                }"
              >
                <template v-for="col in gridCols" :key="`${row.index}-${col}`">
                  <SeriesCollectionCard
                    v-if="itemAt(row.index * gridCols + col - 1)"
                    :series="itemAt(row.index * gridCols + col - 1)!"
                    @click="
                      handleSeriesClick(itemAt(row.index * gridCols + col - 1)!)
                    "
                    @delete="
                      handleDeleteSeries(
                        itemAt(row.index * gridCols + col - 1)!.id,
                      )
                    "
                  />
                  <!-- 아직 청크가 안 온 자리. 높이를 잡아둬야 행이 안 무너진다 -->
                  <div
                    v-else-if="row.index * gridCols + col - 1 < totalCount"
                    class="bg-muted aspect-[2/3] animate-pulse rounded-lg"
                  ></div>
                </template>
              </div>
            </div>
          </template>

          <!-- 리스트 -->
          <template v-else>
            <div
              v-for="row in listVirtualizer?.getVirtualItems() ?? []"
              :key="row.index"
              :ref="(el) => listVirtualizer?.measureElement(el as Element)"
              :data-index="row.index"
              class="absolute inset-x-0 top-0 grid pb-2"
              :style="{
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${listCols}, minmax(0, 1fr))`,
                gap: `${LIST_GAP}px`,
              }"
            >
              <template v-for="col in listCols" :key="`${row.index}-${col}`">
                <SeriesCollectionRowCard
                  v-if="itemAt(row.index * listCols + col - 1)"
                  :series="itemAt(row.index * listCols + col - 1)!"
                  @click="
                    handleSeriesClick(itemAt(row.index * listCols + col - 1)!)
                  "
                  @delete="
                    handleDeleteSeries(
                      itemAt(row.index * listCols + col - 1)!.id,
                    )
                  "
                />
                <!-- 아직 청크가 안 온 자리. 카드와 같은 껍데기로 둔다 -->
                <div
                  v-else-if="row.index * listCols + col - 1 < totalCount"
                  class="bg-muted animate-pulse rounded-lg border"
                  :style="{ height: `${listSkeletonHeight}px` }"
                ></div>
              </template>
            </div>
          </template>
        </div>

        <!-- 빈 상태 - 검색 결과 없음 -->
        <div
          v-else-if="searchQuery.trim().length > 0"
          class="flex h-full flex-col items-center justify-center text-center"
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
          class="flex h-full flex-col items-center justify-center text-center"
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
              <Icon icon="solar:magic-stick-3-bold-duotone" class="h-4 w-4" />
              자동 감지 실행
            </Button>
          </div>
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
        @updated="refetchCollections"
      />

      <!-- 새 시리즈 만들기 다이얼로그 -->
      <CreateSeriesDialog
        v-model:open="showCreateDialog"
        @created="refetchCollections"
      />

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
  </div>
</template>
