<script setup lang="ts">
import HelpDialog from "@/components/common/HelpDialog.vue";
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
import { Label } from "@/components/ui/label";
import { useBookDelete } from "@/composables/useBookDelete";
import {
  activeFilters,
  libraryPathLabel,
  normalizeReadStatus,
  parseFilterChipKey,
  parseLibraryPaths,
  parseReadStatuses,
  toggleFilterValue,
  LIBRARY_FILTER_DEFAULTS,
  READ_STATUS_OPTIONS,
  type LibraryFilterState,
} from "@/lib/libraryFilters";
import { toggleSearchTerm } from "@/lib/searchQuery";
import { nextFocusIndex, type FocusDirection } from "@/lib/gridNavigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKeybindings } from "@/composables/useKeybindings";
import { useQueryAndParams } from "@/composables/useQueryAndParams";
import { useFocusRestoration } from "@/composables/useScrollRestoration";
import { useVirtualCardList } from "@/composables/useVirtualCardList";
import { useLibraryScanStore } from "@/store/libraryScanStore";
import { SORT_CYCLE, SORT_LABELS, nextSortBy } from "@/store/sortCycle";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import PageHeader from "../layout/PageHeader.vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { debouncedRef, debouncedWatch } from "@vueuse/core";
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  toRaw,
  watch,
  type Ref,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type { Book, FilterParams } from "../../../types/ipc";
import {
  getRandomBook,
  getPresets,
  ipcRenderer,
  openBookFolder,
  openNewWindow,
  toggleBookFavorite,
} from "../../api";
import AppliedFilterChips from "../common/AppliedFilterChips.vue";
import PresetDropdown from "../common/PresetDropdown.vue";
import SmartSearchInput from "../common/SmartSearchInput.vue";
import SortMenu from "../common/SortMenu.vue";
import ViewOptionsBar from "../common/ViewOptionsBar.vue";
import PageToolbar from "../layout/PageToolbar.vue";
import BookCard from "../feature/BookCard.vue";
import BookDetailDialog from "../feature/BookDetailDialog.vue";
import BookPreviewDialog from "../feature/BookPreviewDialog.vue";
import BookRowCard from "../feature/BookRowCard.vue";
import LibraryScanProgress from "../feature/LibraryScanProgress.vue";

const queryClient = useQueryClient();

const uiStore = useUiStore();

const route = useRoute();
const router = useRouter();
const searchInputRef = ref<InstanceType<typeof SmartSearchInput> | null>(null);

const showBookDetailDialog = ref(false);
const showBookPreviewDialog = ref(false);
const selectedBook = ref<Book | null>(null);
const previewBook = ref<Book | null>(null);

// Filter and Sort State
const libraryPath = ref((route.query.libraryPath as string) || "all");
const readStatus = ref(normalizeReadStatus(route.query.readStatus));
const isFavorite = ref((route.query.isFavorite as string) || "all");
const offlineStatus = ref<"all" | "online" | "offline">(
  (route.query.offlineStatus as "all" | "online" | "offline") || "all",
);
const sortBy = ref((route.query.sortBy as string) || "added_at");
const sortOrder = ref<"asc" | "desc">(
  (route.query.sortOrder as "asc" | "desc") || "desc",
);
const viewMode = ref<"grid" | "list">("grid");

const { schWord: searchQuery } = useQueryAndParams({
  queries: {
    libraryPath,
    readStatus,
    isFavorite,
    offlineStatus,
    sortBy,
    sortOrder,
  },
  defaultOptions: {
    libraryPath: "all",
    readStatus: "all",
    isFavorite: "all",
    offlineStatus: "all",
    sortBy: "added_at",
    sortOrder: "desc",
  },
  // 사이드바로 돌아왔다고 검색·필터를 지우지 않는다. 초기화는 "필터 적용중"
  // 표시 옆의 버튼으로만 한다
  resetOnEmptyQuery: false,
});

const selectedLibraryPaths = computed(() =>
  parseLibraryPaths(libraryPath.value),
);
const selectedReadStatuses = computed(() =>
  parseReadStatuses(readStatus.value),
);

// 항목 하나를 누를 때마다 메뉴가 닫히면 조건을 이어서 손볼 수 없다.
// 라디오 항목도 값 변경은 select 이벤트와 무관하게 일어나므로 안전하다
const keepMenuOpen = (event: Event) => event.preventDefault();

// 지금 걸려 있는 검색·필터. 왜 눈에 보여야 하는지는 lib/libraryFilters.ts 참고
const appliedFilters = computed(() =>
  activeFilters({
    searchQuery: searchQuery.value,
    libraryPath: libraryPath.value,
    readStatus: readStatus.value,
    isFavorite: isFavorite.value,
    offlineStatus: offlineStatus.value,
  }),
);

const filterResetters: Record<keyof LibraryFilterState, () => void> = {
  searchQuery: () => (searchQuery.value = LIBRARY_FILTER_DEFAULTS.searchQuery),
  libraryPath: () => (libraryPath.value = LIBRARY_FILTER_DEFAULTS.libraryPath),
  readStatus: () => (readStatus.value = LIBRARY_FILTER_DEFAULTS.readStatus),
  isFavorite: () => (isFavorite.value = LIBRARY_FILTER_DEFAULTS.isFavorite),
  offlineStatus: () =>
    (offlineStatus.value = LIBRARY_FILTER_DEFAULTS.offlineStatus),
};

/** 값을 여러 개 고를 수 있는 필터 */
const multiValueFilters: Partial<
  Record<keyof LibraryFilterState, Ref<string>>
> = {
  libraryPath,
  readStatus,
};

// 걸려 있는 조건 전부 해제
const clearAllFilters = () =>
  Object.values(filterResetters).forEach((resetOne) => resetOne());

// 칩 하나만 해제. 여러 값을 고를 수 있는 필터는 누른 값만 빠진다
const clearFilterByKey = (key: string) => {
  const { field, value } = parseFilterChipKey(key);
  const target = multiValueFilters[field];
  if (target && value !== undefined) {
    target.value = toggleFilterValue(target.value, value);
    return;
  }
  filterResetters[field]();
};

// 검색어 debounce 적용 (API 호출 최적화)
const debouncedSearchQuery = debouncedRef(searchQuery, 300);

const { data: config, isSuccess: isConfigLoaded } = useQuery({
  queryKey: ["config"],
  queryFn: () => ipcRenderer.invoke("get-config"),
});

// 태그 표시 설정
const hideLibraryTags = computed(() => {
  return config.value?.hideLibraryTags === true;
});

// 설정 초기화 완료 여부를 추적하는 플래그
const isSettingsInitialized = ref(false);

// 설정을 로드하는 공통 함수
const loadSettings = () => {
  if (config.value && config.value.libraryViewSettings) {
    const settings = config.value.libraryViewSettings as {
      sortBy: string;
      sortOrder: "asc" | "desc";
      readStatus: string;
      viewMode: "grid" | "list";
      searchQuery?: string;
      libraryPath?: string;
      isFavorite?: string;
      offlineStatus?: "all" | "online" | "offline";
    };
    const query = route.query;

    // 각 파라미터를 개별적으로 확인하여 URL 쿼리에 없는 것만 설정에서 불러옴
    if (!query.sortBy) {
      sortBy.value = settings.sortBy;
    }
    if (!query.sortOrder) {
      sortOrder.value = settings.sortOrder;
    }
    if (!query.readStatus) {
      readStatus.value = normalizeReadStatus(settings.readStatus);
    }
    // 검색어와 나머지 필터도 복원한다. 구버전 설정에는 없는 값이라 기본값으로 대체
    if (!query.schWord) {
      searchQuery.value =
        settings.searchQuery ?? LIBRARY_FILTER_DEFAULTS.searchQuery;
    }
    if (!query.libraryPath) {
      libraryPath.value =
        settings.libraryPath ?? LIBRARY_FILTER_DEFAULTS.libraryPath;
    }
    if (!query.isFavorite) {
      isFavorite.value =
        settings.isFavorite ?? LIBRARY_FILTER_DEFAULTS.isFavorite;
    }
    if (!query.offlineStatus) {
      offlineStatus.value =
        settings.offlineStatus ?? LIBRARY_FILTER_DEFAULTS.offlineStatus;
    }
    // viewMode는 URL 쿼리에 포함되지 않으므로 항상 설정에서 불러옴
    viewMode.value = settings.viewMode || "grid";

    // 설정 적용 완료 후 다음 틱에서 플래그 설정 (이후 변경부터 저장)
    nextTick(() => {
      isSettingsInitialized.value = true;
    });
  }
};

// Load settings when config is loaded
watch(
  isConfigLoaded,
  (loaded) => {
    if (loaded) {
      loadSettings();
    }
  },
  { immediate: true },
);

/**
 * 화면에 떠 있는지. keep-alive라 다른 페이지로 가도 이 컴포넌트는 살아 있고
 * 단축키 리스너도 그대로 남는다. 방향키를 그때도 잡으면 설정·통계 화면의
 * 스크롤이 막히므로 단축키 전체를 이 값으로 묶는다.
 */
const isPageActive = ref(true);

// 다른 페이지로 이동할 때 설정 저장 방지
onDeactivated(() => {
  // 다른 페이지로 이동 시 설정 저장 방지
  isSettingsInitialized.value = false;
  isPageActive.value = false;
});

// keep-alive로 돌아왔을 때는 설정을 다시 읽지 않는다.
//
// 컴포넌트가 살아 있어 화면에 있는 값이 항상 최신이다. 반면 config 저장은
// 1초 디바운스라, 조건을 바꾸고 곧바로 페이지를 뜨면 저장 전에 나가게 된다.
// 그 상태에서 돌아올 때 config를 다시 읽으면 방금 바꾼 조건이 옛날 값으로
// 되돌아간다. 예전에는 쿼리 없는 주소로 돌아올 때마다 상태가 초기화됐기 때문에
// 여기서 다시 불러오는 게 필요했지만, 이제는 초기화하지 않으므로 불필요하다.
onActivated(() => {
  isPageActive.value = true;
  if (isConfigLoaded.value) {
    isSettingsInitialized.value = true;
  }
});

// Watch for filter/sort changes and save them
debouncedWatch(
  [
    sortBy,
    sortOrder,
    readStatus,
    viewMode,
    searchQuery,
    libraryPath,
    isFavorite,
    offlineStatus,
  ],
  async () => {
    // 설정이 초기화되기 전의 변경은 저장하지 않음
    if (!isConfigLoaded.value || !isSettingsInitialized.value) return;

    const settings = {
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      readStatus: readStatus.value,
      viewMode: viewMode.value,
      searchQuery: searchQuery.value,
      libraryPath: libraryPath.value,
      isFavorite: isFavorite.value,
      offlineStatus: offlineStatus.value,
    };
    await ipcRenderer.invoke("set-config", {
      key: "libraryViewSettings",
      value: settings,
    });
    // 설정 저장 후 config 쿼리 캐시 무효화하여 최신 값 반영
    queryClient.invalidateQueries({ queryKey: ["config"] });
  },
  { debounce: 1000 },
);

const libraryDirectories = computed(
  () => config.value?.libraryFolders || ([] as string[]),
);

// 프리셋 데이터 (프리셋 순환 단축키용)
const { data: presets } = useQuery({
  queryKey: ["presets"],
  queryFn: getPresets,
});

// 프리셋 순환 추적
const currentPresetIndex = ref(-1);

const queryKey = computed(
  () =>
    [
      "books",
      {
        searchQuery: debouncedSearchQuery.value,
        libraryPath: selectedLibraryPaths.value,
        readStatus: selectedReadStatuses.value,
        offlineStatus: offlineStatus.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        isFavorite: isFavorite.value === "favorite",
        randomSeed:
          sortBy.value === "random" ? uiStore.libraryRandomSeed : undefined,
      },
    ] as const,
);

// 배치·줌·스크롤 복원은 useVirtualCardList가 담당한다. 여기는 데이터를 어떻게
// 가져올지만 알려준다

/** 청크 하나에 담는 책 수. 기존 get-books pageSize와 같다 */
const CHUNK_SIZE = 50;

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
} = useVirtualCardList<Book>({
  viewMode,
  chunkSize: CHUNK_SIZE,
  // 1건만 요청해 총 건수만 확보한다 (스크롤러 총 높이용)
  fetchTotal: async () => {
    const result = await ipcRenderer.invoke("get-books", {
      pageParam: 0,
      pageSize: 1,
      ...queryKey.value[1],
    });
    return result.totalCount ?? 0;
  },
  fetchChunk: async (chunkIndex) => {
    const result = await ipcRenderer.invoke("get-books", {
      pageParam: chunkIndex,
      pageSize: CHUNK_SIZE,
      skipCount: true, // 총 건수는 메타 조회가 이미 갖고 있다
      ...queryKey.value[1],
    });
    return (result.data ?? []) as Book[];
  },
  metaKey: () => ["books-meta", queryKey.value[1]],
  chunkKey: (chunkIndex) => ["books", queryKey.value[1], chunkIndex],
  // 필터가 바뀌면 새 키의 청크를 받아 다시 그려야 하므로 스켈레톤 상태로 돌린다
  resetKey: () => queryKey.value[1],
});

// ===== 키보드 카드 선택 =====

/**
 * 선택된 카드의 전체 목록 기준 인덱스. -1이면 선택 없음.
 *
 * 뷰 모드와 무관한 절대 순번이라 그리드↔리스트를 오가도 같은 책을 가리킨다.
 * 열 수만 그때그때 다시 읽으면 된다.
 */
const focusedIndex = ref(-1);

useFocusRestoration(focusedIndex);

const activeCols = computed(() =>
  viewMode.value === "grid" ? gridCols.value : listCols.value,
);

const activeVirtualizer = computed(() =>
  viewMode.value === "grid" ? gridVirtualizer.value : listVirtualizer.value,
);

const focusedBook = computed(() =>
  focusedIndex.value < 0 ? undefined : itemAt(focusedIndex.value),
);

const scrollFocusedIntoView = () => {
  if (focusedIndex.value < 0) return;
  const lanes = Math.max(1, activeCols.value);
  activeVirtualizer.value?.scrollToIndex(
    Math.floor(focusedIndex.value / lanes),
    { align: "auto" },
  );
};

const moveFocus = (direction: FocusDirection) => {
  if (totalCount.value === 0) return;

  if (focusedIndex.value < 0) {
    // 첫 방향키는 화면에 보이는 맨 윗줄을 잡는다. 0번으로 보내면 스크롤이 튄다.
    // getVirtualItems()는 overscan으로 화면 위쪽 줄까지 그려두므로 여기서 쓰면
    // 안 보이는 줄이 잡히고 목록이 그만큼 위로 딸려 올라간다
    const startRow = activeVirtualizer.value?.range?.startIndex ?? 0;
    const firstVisible = startRow * Math.max(1, activeCols.value);
    focusedIndex.value = Math.min(firstVisible, totalCount.value - 1);
  } else {
    focusedIndex.value = nextFocusIndex(
      focusedIndex.value,
      direction,
      activeCols.value,
      totalCount.value,
    );
  }
  scrollFocusedIntoView();
};

/** 아직 청크가 안 온 자리면 열지 않고 키를 흘려보낸다 */
const openFocused = (newWindow = false) => {
  const book = focusedBook.value;
  if (!book) return false;

  if (book.is_offline) {
    toast.warning("라이브러리 폴더에 접근할 수 없습니다.", {
      description: "해당 폴더에 접근할 수 있는지 확인한 후 다시 스캔해 주세요.",
    });
    return;
  }

  const filter = JSON.stringify(toRaw(queryKey.value[1]));
  if (newWindow) {
    openNewWindow(
      `/viewer/${book.id}?${new URLSearchParams({ filter }).toString()}`,
    );
  } else {
    router.push({ name: "Viewer", params: { id: book.id }, query: { filter } });
  }
};

/** 해제할 선택이 없으면 false를 돌려 레이아웃의 창 최소화로 넘긴다 */
const clearFocus = () => {
  if (focusedIndex.value < 0) return false;
  focusedIndex.value = -1;
};

/** 카드 밖(여백·목록 아래 빈 공간)을 누르면 선택을 푼다 */
const handleScrollerClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).closest("[data-book-card]")) return;
  focusedIndex.value = -1;
};

// 검색·정렬이 바뀌면 순서가 달라져 같은 인덱스가 다른 책을 가리킨다
watch(queryKey, () => {
  focusedIndex.value = -1;
});

// 프리픽스 무효화라 마운트된 청크만 즉시 다시 받고 나머지는 stale 표시만 된다.
// "보이는 구간만 다시 받기 + 스크롤 위치 유지"가 여기서 나온다.
const invalidateBooks = () => {
  queryClient.invalidateQueries({ queryKey: ["books"] });
  queryClient.invalidateQueries({ queryKey: ["books-meta"] });
};

onMounted(() => {
  // 라이브러리 스캔 Store 초기화
  const libraryScanStore = useLibraryScanStore();
  libraryScanStore.initialize();

  ipcRenderer.on("books-updated", invalidateBooks);

  // 시작 시 자동 스캔은 스캔이 끝난 뒤 썸네일을 따로 만든다. 그 단계에서는
  // books-updated가 나가지 않아, 이 신호를 받아야 새 표지가 목록에 반영된다.
  ipcRenderer.on("library-scan-completed", invalidateBooks);
});

onUnmounted(() => {
  ipcRenderer.off("books-updated", invalidateBooks);
  ipcRenderer.off("library-scan-completed", invalidateBooks);
});

// 메타데이터 칩 클릭은 전부 "검색어에서 해당 항목을 켜고 끄기"로 같다
const toggleTerm = (term: string) => {
  searchQuery.value = toggleSearchTerm(searchQuery.value, term);
};

const toggleTag = (tag: string) => toggleTerm(`tag:${tag}`);
const excludeTag = (tag: string) => toggleTerm(`-tag:${tag}`);
const toggleArtist = (artist: string) => toggleTerm(`artist:${artist}`);
const toggleGroup = (group: string) => toggleTerm(`group:${group}`);
const toggleSeries = (series: string) => toggleTerm(`series:${series}`);
const toggleCharacter = (character: string) =>
  toggleTerm(`character:${character}`);

// 정렬 메뉴는 D키 순환(SORT_CYCLE)과 같은 순서로 세운다. 목록이 한 곳에만
// 있어야 둘이 어긋나지 않는다. 랜덤은 순환에서 제외된 값이라 끝에 따로 붙인다
const sortOptions = SORT_CYCLE.map((value) => ({
  value,
  label: SORT_LABELS[value] ?? value,
})).concat({ value: "random", label: "랜덤" });

const setSortBy = (column: string) => {
  sortBy.value = column;
};

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
};

// 랜덤 정렬 순서 재셔플: 새 시드 발급 → queryKey 변경으로 목록이 1페이지부터 다시 로드됨
const reshuffleRandomOrder = () => {
  uiStore.reshuffleLibraryRandomSeed();
  toast.info("순서를 다시 섞었습니다.");
};

// 정렬 기준 순환 (뷰어와 동일한 순환 목록 사용, random 제외)
const cycleSortBy = () => {
  const next = nextSortBy(sortBy.value, SORT_CYCLE);
  sortBy.value = next;
  toast.info(`정렬 기준: ${SORT_LABELS[next] ?? next}`);
};

// 즐겨찾기 필터 토글
const toggleFavoriteFilter = () => {
  isFavorite.value = isFavorite.value === "favorite" ? "all" : "favorite";
  toast.info(isFavorite.value === "favorite" ? "즐겨찾기만 표시" : "전체 표시");
};

// 읽음 상태 순환 (모두 → 안읽음 → 읽는중 → 완독)
const cycleReadStatus = () => {
  const values = READ_STATUS_OPTIONS.map((option) => option.value);
  const current = selectedReadStatuses.value[0];
  const next = values[current ? values.indexOf(current) + 1 : 0];

  readStatus.value = next ?? LIBRARY_FILTER_DEFAULTS.readStatus;
  toast.info(
    `읽음 상태: ${READ_STATUS_OPTIONS.find((o) => o.value === next)?.label ?? "모두"}`,
  );
};

// 프리셋 순환
const cyclePreset = () => {
  if (!presets.value || presets.value.length === 0) {
    toast.info("저장된 프리셋이 없습니다.");
    return;
  }
  currentPresetIndex.value =
    (currentPresetIndex.value + 1) % presets.value.length;
  const preset = presets.value[currentPresetIndex.value];
  searchQuery.value = preset.query;
  toast.info(`프리셋: ${preset.name}`);
};

// 라이브러리 폴더 순환 ([ / ] 키)
const cycleLibrary = (direction: 1 | -1) => {
  const dirs = libraryDirectories.value;
  if (dirs.length === 0) return;

  // 여러 개를 골라둔 상태에서는 첫 번째를 기준으로 삼고, 순환 결과는 하나만 남긴다
  const currentIndex = dirs.indexOf(selectedLibraryPaths.value[0]);
  // 순환: all(-1) → 0 → 1 → ... → N-1 → all(-1)
  const totalOptions = dirs.length + 1; // all + 각 폴더
  const currentSlot = currentIndex === -1 ? 0 : currentIndex + 1;
  const nextSlot = (currentSlot + direction + totalOptions) % totalOptions;

  libraryPath.value =
    nextSlot === 0 ? LIBRARY_FILTER_DEFAULTS.libraryPath : dirs[nextSlot - 1];
  toast.info(
    nextSlot === 0 ? "모든 라이브러리" : libraryPathLabel(libraryPath.value),
  );
};

const openRandomBookFromCurrentView = async () => {
  try {
    const randomBook = await getRandomBook(
      toRaw(queryKey.value[1]) as FilterParams,
    );
    if (!randomBook || !randomBook.id) {
      toast.info("현재 검색 조건에 맞는 랜덤 책을 찾을 수 없습니다.");
      return;
    }

    router.push({
      name: "Viewer",
      params: { id: randomBook.id },
      query: {
        filter: JSON.stringify(toRaw(queryKey.value[1])),
      },
    });
  } catch (error) {
    console.error("Failed to get random book:", error);
    toast.error("랜덤 책을 불러오는 데 실패했습니다.");
  }
};

const handleToggleFavorite = async (
  bookId: number,
  currentIsFavorite: boolean,
) => {
  try {
    const newFavoriteStatus = await toggleBookFavorite(
      bookId,
      !currentIsFavorite,
    );
    queryClient.invalidateQueries({ queryKey: ["books"] });
    toast.success(`즐겨찾기 ${newFavoriteStatus ? "추가" : "해제"}되었습니다.`);
  } catch (error) {
    console.error(`Failed to toggle favorite for book ${bookId}:`, error);
    toast.error(
      `즐겨찾기 ${!currentIsFavorite ? "추가" : "해제"}에 실패했습니다.`,
    );
  }
};

const handleOpenFolder = async (bookPath: string) => {
  try {
    await openBookFolder(bookPath);
    toast.success("폴더가 열렸습니다.");
  } catch (error) {
    console.error(`Failed to open folder for book ${bookPath}:`, error);
    toast.error("폴더 열기에 실패했습니다.");
  }
};

const handleShowDetails = (book: Book) => {
  selectedBook.value = book;
  showBookDetailDialog.value = true;
};

const handleShowPreview = (book: Book) => {
  previewBook.value = book;
  showBookPreviewDialog.value = true;
};

// 라이브러리 단축키 등록
useKeybindings(
  "library",
  {
    "library:search-focus": () => {
      searchInputRef.value?.focus();
      focusedIndex.value = -1;
    },
    "library:focus-left": () => moveFocus("left"),
    "library:focus-right": () => moveFocus("right"),
    "library:focus-up": () => moveFocus("up"),
    "library:focus-down": () => moveFocus("down"),
    "library:open-focused": () => openFocused(),
    "library:open-focused-new-window": () => openFocused(true),
    "library:clear-focus": clearFocus,
    "library:cycle-sort": cycleSortBy,
    "library:sort-order-toggle": () => {
      toggleSortOrder();
    },
    "library:quit-app": () => {
      ipcRenderer.send("close-window");
    },
    "library:toggle-favorite": toggleFavoriteFilter,
    "library:cycle-read-status": cycleReadStatus,
    "library:cycle-preset": cyclePreset,
    "library:prev-library": () => cycleLibrary(-1),
    "library:next-library": () => cycleLibrary(1),
  },
  { enabled: () => isPageActive.value },
);

// 삭제 다이얼로그는 페이지가 하나만 들고 있는다. 카드가 각자 들고 있으면
// 다이얼로그를 연 채 스크롤해 카드가 언마운트될 때 같이 사라진다.
const {
  isOpen: isDeleteDialogOpen,
  target: deleteTarget,
  permanentDelete,
  requestDelete: handleRequestDelete,
  confirmDelete: confirmDeleteBook,
} = useBookDelete();
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <div class="flex flex-col gap-2">
      <!-- 스캔 진행률 표시 -->
      <LibraryScanProgress />

      <PageHeader icon="solar:library-bold-duotone" title="라이브러리">
        <template #help>
          <HelpDialog
            title="라이브러리 도움말"
            description="라이브러리 사용법 및 검색 팁"
          >
            <template #trigger>
              <Button variant="ghost" size="icon">
                <Icon
                  icon="solar:question-circle-bold-duotone"
                  class="h-6 w-6"
                />
              </Button>
            </template>
            <div class="text-muted-foreground space-y-4 text-sm">
              <p>
                이 화면에서는 추가된 만화책들을 관리하고 열람할 수 있습니다.
              </p>
              <h3 class="text-foreground text-base font-semibold">
                키보드 단축키
              </h3>
              <ul class="list-inside list-disc">
                <li><kbd>Ctrl</kbd>+<kbd>F</kbd>: 검색창 포커스</li>
                <li><kbd>D</kbd>: 정렬 기준 순환</li>
                <li><kbd>S</kbd>: 정렬 순서 전환 (오름차순/내림차순)</li>
                <li><kbd>F</kbd>: 즐겨찾기 필터 토글</li>
                <li><kbd>R</kbd>: 읽음 상태 순환 (모두→안읽음→읽는중→완독)</li>
                <li><kbd>P</kbd>: 프리셋 순환</li>
                <li><kbd>[</kbd> / <kbd>]</kbd>: 이전/다음 라이브러리 폴더</li>
                <li><kbd>Ctrl</kbd>+<kbd>Wheel</kbd>: 썸네일 밀도 조절</li>
                <li>
                  <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>: 책 선택
                  이동
                </li>
                <li><kbd>Enter</kbd>: 선택한 책 열기</li>
                <li>
                  <kbd>Ctrl</kbd>+<kbd>Enter</kbd>: 선택한 책 새 창으로 열기
                </li>
                <li><kbd>Esc</kbd>: 선택 해제 (선택이 없으면 창 최소화)</li>
              </ul>
              <h3 class="text-foreground text-base font-semibold">검색 팁</h3>
              <ul class="list-inside list-disc">
                <li>
                  <kbd>Ctrl</kbd>+<kbd>F</kbd>로 검색창에 빠르게 포커스할 수
                  있습니다.
                </li>
                <li>
                  검색창에 제목, 작가, 태그, 시리즈를 입력하여 검색할 수
                  있습니다.
                </li>
                <li><code>tag:태그명</code>: 특정 태그로 검색합니다.</li>
                <li><code>artist:작가명</code>: 특정 작가로 검색합니다.</li>
                <li><code>series:시리즈명</code>: 특정 시리즈로 검색합니다.</li>
                <li><code>id:123456</code>: 히토미 ID로 검색합니다.</li>
                <li>
                  <code>id:&gt;3000000</code>, <code>id:3000000-3200000</code>:
                  히토미 ID 범위로 검색합니다. <code>&gt;</code>
                  <code>&gt;=</code> <code>&lt;</code> <code>&lt;=</code>와 구간
                  표기를 쓸 수 있으며, 랜덤 정렬에서 오래된 작품을 걸러낼 때
                  유용합니다.
                </li>
                <li>여러 검색어를 공백으로 구분하여 조합할 수 있습니다.</li>
                <li>
                  <Icon
                    icon="solar:bookmark-bold-duotone"
                    class="inline-block h-4 w-4 align-text-bottom"
                  />
                  버튼을 클릭하여 저장된 프리셋 검색어를 사용할 수 있습니다.
                </li>
              </ul>
              <h3 class="text-foreground text-base font-semibold">
                필터 및 정렬
              </h3>
              <ul class="list-inside list-disc">
                <li>
                  <Icon
                    icon="solar:filter-bold-duotone"
                    class="inline-block h-4 w-4 align-text-bottom"
                  />
                  버튼의 <strong>라이브러리 폴더</strong>에서 특정 폴더의 책만
                  볼 수 있습니다.
                </li>
                <li>
                  뷰어에서 이전/다음 책으로 이동 시, 라이브러리 화면에서
                  적용했던 검색 및 필터 조건이 유지됩니다.
                </li>
                <li>
                  검색과 필터는 앱을 껐다 켜도 유지됩니다. 지금 걸려 있는 조건은
                  검색창 아래에 표시되며, 조건을 클릭하면 그것만,
                  <strong>전체 해제</strong>를 누르면 한 번에 풀 수 있습니다.
                </li>
                <li>
                  <Icon
                    icon="solar:filter-bold-duotone"
                    class="inline-block h-4 w-4 align-text-bottom"
                  />
                  버튼을 클릭하여 읽음 상태 및 즐겨찾기 여부로 필터링할 수
                  있습니다.
                </li>
                <li>
                  <Icon
                    icon="solar:sort-bold-duotone"
                    class="inline-block h-4 w-4 align-text-bottom"
                  />
                  버튼을 클릭하여 다양한 기준으로 정렬할 수 있습니다.
                </li>
              </ul>
              <h3 class="text-foreground text-base font-semibold">책 관리</h3>
              <ul class="list-inside list-disc">
                <li>책 카드를 클릭하여 뷰어를 열 수 있습니다.</li>
                <li>
                  책 카드를 <code>Ctrl</code>+클릭하거나 우클릭 메뉴의 '새
                  창으로 열기'를 선택하여 뷰어를 새 창에서 열 수 있습니다.
                </li>
                <li>
                  책 카드 우클릭 메뉴를 통해 폴더 열기, 즐겨찾기 추가/해제 등의
                  작업을 할 수 있습니다.
                </li>
              </ul>
              <h3 class="text-foreground text-base font-semibold">미리보기</h3>
              <ul class="list-inside list-disc">
                <li>
                  그리드 뷰에서 책 카드를 우클릭하여 '미리보기' 메뉴를 선택하면
                  페이지를 미리볼 수 있습니다.
                </li>
                <li>
                  리스트 뷰에서는 미리보기 버튼을 클릭하여 페이지를 미리볼 수
                  있습니다.
                </li>
                <li>
                  미리보기에서는 책의 모든 페이지를 가로 스크롤로 확인할 수
                  있습니다.
                </li>
              </ul>
            </div>
          </HelpDialog>
        </template>
        <template #actions>
          <Button
            variant="secondary"
            size="icon"
            @click="router.push('/settings?tab=library')"
          >
            <Icon icon="solar:settings-bold-duotone" class="h-6 w-6" />
          </Button>
        </template>
      </PageHeader>
    </div>

    <!-- 콘텐츠 -->
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <!-- 검색 및 필터 영역 -->
      <PageToolbar>
        <template #search>
          <SmartSearchInput
            ref="searchInputRef"
            v-model="searchQuery"
            placeholder="제목, 작가, 태그, 시리즈로 검색"
          />
        </template>

        <template #preset>
          <PresetDropdown v-model="searchQuery" />
        </template>

        <template #filter>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline">
                <Icon icon="solar:filter-bold-duotone" class="h-4 w-4" />
                필터
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-64">
              <!-- 폴더도 책을 감추는 조건이라 다른 필터와 같은 자리에 둔다 -->
              <DropdownMenuLabel>라이브러리 폴더</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                :model-value="selectedLibraryPaths.length === 0"
                @select="keepMenuOpen"
                @update:model-value="
                  libraryPath = LIBRARY_FILTER_DEFAULTS.libraryPath
                "
              >
                모든 라이브러리
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                v-for="dir in libraryDirectories"
                :key="dir"
                :model-value="selectedLibraryPaths.includes(dir)"
                class="truncate"
                @select="keepMenuOpen"
                @update:model-value="
                  libraryPath = toggleFilterValue(libraryPath, dir)
                "
              >
                <span class="truncate" :title="dir">{{ dir }}</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>읽음 상태</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                :model-value="selectedReadStatuses.length === 0"
                @select="keepMenuOpen"
                @update:model-value="
                  readStatus = LIBRARY_FILTER_DEFAULTS.readStatus
                "
              >
                모두
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                v-for="option in READ_STATUS_OPTIONS"
                :key="option.value"
                :model-value="selectedReadStatuses.includes(option.value)"
                @select="keepMenuOpen"
                @update:model-value="
                  readStatus = toggleFilterValue(readStatus, option.value)
                "
              >
                {{ option.label }}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>즐겨찾기</DropdownMenuLabel>
              <DropdownMenuRadioGroup v-model="isFavorite">
                <DropdownMenuRadioItem value="all" @select="keepMenuOpen">
                  모두
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="favorite" @select="keepMenuOpen">
                  즐겨찾기만
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>오프라인 상태</DropdownMenuLabel>
              <DropdownMenuRadioGroup v-model="offlineStatus">
                <DropdownMenuRadioItem value="all" @select="keepMenuOpen">
                  모두
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="online" @select="keepMenuOpen">
                  온라인만
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="offline" @select="keepMenuOpen">
                  오프라인만
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
          >
            <!-- 랜덤 정렬은 오름/내림이 없다. 그 자리를 다시 섞기가 대신한다 -->
            <template v-if="sortBy === 'random'" #order>
              <Button
                variant="outline"
                class="rounded-l-none border-l-0"
                aria-label="순서 다시 섞기"
                @click="reshuffleRandomOrder"
              >
                <Icon icon="solar:refresh-bold-duotone" class="h-4 w-4" />
              </Button>
            </template>
          </SortMenu>
        </template>
        <template #extra>
          <Button
            variant="outline"
            :disabled="totalCount === 0"
            @click="openRandomBookFromCurrentView"
          >
            <Icon icon="solar:rocket-bold-duotone" class="h-4 w-4" />
            랜덤
          </Button>
        </template>

        <template #view>
          <ViewOptionsBar v-model="viewMode" />
        </template>

        <!-- 검색·필터가 앱을 껐다 켜도 유지되기 때문에, 지금 무엇이 걸려
             있는지 보이지 않으면 "책이 사라졌다"는 오해를 산다 -->
        <template #status>
          <AppliedFilterChips
            :filters="appliedFilters"
            @clear="clearFilterByKey"
            @clear-all="clearAllFilters"
          />
        </template>

        <template #count>
          총 {{ totalCount.toLocaleString("ko-KR") }}권
        </template>
      </PageToolbar>

      <!-- 목록 (가상 스크롤)
           스크롤러는 항상 마운트해야 합니다. 조건부로 두면 virtualizer가
           초기화 시점에 스크롤 요소를 못 잡아 행이 하나도 안 그려집니다.
           .vspace는 zoom 바깥, 카드만 행 안쪽 .zoomed에 들어갑니다.
           행을 zoom 안으로 옮기면 measureElement가 1/z만큼 어긋납니다 -->
      <div
        ref="scrollerRef"
        class="library-scroller relative min-h-0 flex-grow overflow-y-auto"
        @wheel="handleZoomWheel"
        @scroll="updateVisibleRange"
        @click="handleScrollerClick"
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
                  <BookCard
                    v-if="itemAt(row.index * gridCols + col - 1)"
                    :book="itemAt(row.index * gridCols + col - 1)!"
                    :query-key="queryKey"
                    :is-focused="
                      row.index * gridCols + col - 1 === focusedIndex
                    "
                    :hide-tags="hideLibraryTags"
                    :external-image-viewer-path="
                      config?.externalImageViewerPath
                    "
                    :external-archive-viewer-path="
                      config?.externalArchiveViewerPath
                    "
                    @select-tag="toggleTag"
                    @exclude-tag="excludeTag"
                    @select-artist="toggleArtist"
                    @select-group="toggleGroup"
                    @toggle-favorite="handleToggleFavorite"
                    @open-book-folder="handleOpenFolder"
                    @show-details="handleShowDetails"
                    @show-preview="handleShowPreview"
                    @request-delete="handleRequestDelete"
                  />
                  <!-- 아직 청크가 안 온 자리. 높이를 잡아둬야 행이 안 무너집니다 -->
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
                <BookRowCard
                  v-if="itemAt(row.index * listCols + col - 1)"
                  :book="itemAt(row.index * listCols + col - 1)!"
                  :query-key="queryKey"
                  :is-focused="row.index * listCols + col - 1 === focusedIndex"
                  :hide-tags="hideLibraryTags"
                  :external-image-viewer-path="config?.externalImageViewerPath"
                  :external-archive-viewer-path="
                    config?.externalArchiveViewerPath
                  "
                  @select-tag="toggleTag"
                  @exclude-tag="excludeTag"
                  @select-artist="toggleArtist"
                  @select-group="toggleGroup"
                  @select-series="toggleSeries"
                  @select-character="toggleCharacter"
                  @toggle-favorite="handleToggleFavorite"
                  @open-book-folder="handleOpenFolder"
                  @show-details="handleShowDetails"
                  @show-preview="handleShowPreview"
                  @request-delete="handleRequestDelete"
                />
                <!-- 아직 청크가 안 온 자리. 카드와 같은 껍데기로 둔다 -->
                <div
                  v-else-if="row.index * listCols + col - 1 < totalCount"
                  class="bg-muted animate-pulse rounded-lg border"
                  :style="{
                    height: `${listSkeletonHeight}px`,
                  }"
                ></div>
              </template>
            </div>
          </template>
        </div>
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
        <div
          v-else
          class="flex h-full flex-col items-center justify-center text-center"
        >
          <div
            class="text-muted-foreground mb-4 flex flex-col items-center justify-center text-lg"
          >
            <p>등록된 라이브러리/책이 없습니다.</p>
            <p class="flex items-center justify-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                @click="router.push('/settings?tab=library')"
              >
                <Icon icon="solar:settings-bold-duotone" class="h-5 w-5" />
              </Button>
              <span>버튼을 눌러 설정화면으로 이동하세요.</span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <BookDetailDialog
      v-model="showBookDetailDialog"
      :book="selectedBook"
      :on-toggle-favorite="handleToggleFavorite"
      :on-open-folder="handleOpenFolder"
    />

    <BookPreviewDialog
      :open="showBookPreviewDialog"
      :book="previewBook"
      @update:open="showBookPreviewDialog = $event"
    />

    <!-- 삭제 확인 다이얼로그 (카드가 아니라 페이지가 들고 있다) -->
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
        <p v-if="deleteTarget" class="truncate text-sm font-medium">
          {{ deleteTarget.title }}
        </p>
        <Label class="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox v-model="permanentDelete" />
          휴지통을 거치지 않고 영구 삭제
        </Label>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction @click="confirmDeleteBook">삭제</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
