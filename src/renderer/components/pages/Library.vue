<script setup lang="ts">
import HelpDialog from "@/components/common/HelpDialog.vue";
import { Button } from "@/components/ui/button";
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
import { useWindowEvent } from "@/composable/useWindowEvent";
import { Icon } from "@iconify/vue";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import { AcceptableValue } from "reka-ui";
import { debouncedWatch } from "@vueuse/core";
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  toRaw,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type { Book, FilterParams } from "../../../types/ipc";
import {
  getRandomBook,
  ipcRenderer,
  openBookFolder,
  toggleBookFavorite,
} from "../../api";
import PresetDropdown from "../common/PresetDropdown.vue";
import SmartSearchInput from "../common/SmartSearchInput.vue";
import BookCard from "../feature/BookCard.vue";
import BookDetailDialog from "../feature/BookDetailDialog.vue";
import BookPreviewDialog from "../feature/BookPreviewDialog.vue";
import BookRowCard from "../feature/BookRowCard.vue";

const queryClient = useQueryClient();

const route = useRoute();
const router = useRouter();
const loader = ref(null);
const searchInputRef = ref<InstanceType<typeof SmartSearchInput> | null>(null);

const showBookDetailDialog = ref(false);
const showBookPreviewDialog = ref(false);
const selectedBook = ref<Book | null>(null);
const previewBook = ref<Book | null>(null);

// Filter and Sort State
const libraryPath = ref((route.query.libraryPath as string) || "all");
const readStatus = ref<"all" | "read" | "unread">(
  (route.query.readStatus as "all" | "read" | "unread") || "all",
);
const isFavorite = ref((route.query.isFavorite as string) || "all");
const sortBy = ref((route.query.sortBy as string) || "added_at");
const sortOrder = ref<"asc" | "desc">(
  (route.query.sortOrder as "asc" | "desc") || "desc",
);
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

const { schWord: searchQuery } = useQueryAndParams({
  queries: {
    libraryPath,
    readStatus,
    isFavorite,
    sortBy,
    sortOrder,
  },
  defaultOptions: {
    libraryPath: "all",
    readStatus: "all",
    isFavorite: "all",
    sortBy: "added_at",
    sortOrder: "desc",
  },
});

const { data: config, isSuccess: isConfigLoaded } = useQuery({
  queryKey: ["config"],
  queryFn: () => ipcRenderer.invoke("get-config"),
});

// 설정 초기화 완료 여부를 추적하는 플래그
const isSettingsInitialized = ref(false);

// 설정을 로드하는 공통 함수
const loadSettings = () => {
  if (config.value && config.value.libraryViewSettings) {
    const settings = config.value.libraryViewSettings as {
      sortBy: string;
      sortOrder: "asc" | "desc";
      readStatus: "all" | "read" | "unread";
      viewMode: "grid" | "list";
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
      readStatus.value = settings.readStatus;
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

// 다른 페이지로 이동할 때 설정 저장 방지
onDeactivated(() => {
  // 다른 페이지로 이동 시 설정 저장 방지
  isSettingsInitialized.value = false;
});

// keep-alive로 인해 다른 페이지에서 돌아올 때 설정 다시 로드
onActivated(() => {
  // 설정 저장 방지를 위해 플래그 리셋
  isSettingsInitialized.value = false;
  // config가 이미 로드되어 있으면 설정 다시 불러오기
  if (isConfigLoaded.value) {
    loadSettings();
  }
});

// Watch for filter/sort changes and save them
debouncedWatch(
  [sortBy, sortOrder, readStatus, viewMode],
  async () => {
    // 설정이 초기화되기 전의 변경은 저장하지 않음
    if (!isConfigLoaded.value || !isSettingsInitialized.value) return;

    const settings = {
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      readStatus: readStatus.value,
      viewMode: viewMode.value,
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

const libraryDirectories = computed(() => config.value?.libraryFolders || []);

const queryKey = computed(
  () =>
    [
      "books",
      {
        searchQuery: searchQuery.value,
        libraryPath: libraryPath.value,
        readStatus: readStatus.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        isFavorite: isFavorite.value === "favorite",
      },
    ] as const,
);

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
    return ipcRenderer.invoke("get-books", {
      pageParam,
      pageSize: 50,
      ...queryKey.value[1],
    });
  },
  getNextPageParam: (lastPage) => {
    return lastPage.hasNextPage ? lastPage.nextPage : undefined;
  },
  initialPageParam: 0,
  refetchOnWindowFocus: false, // 윈도우 포커스 시 재조회 방지
  refetchOnMount: false, // 컴포넌트 마운트 시 재조회 방지
});

const books = computed(
  () => data.value?.pages.flatMap((page) => page.data) ?? [],
);

onMounted(() => {
  ipcRenderer.on("books-updated", () =>
    queryClient.invalidateQueries({ queryKey: ["books"] }),
  );
});

// keep-alive로 캐시된 컴포넌트가 활성화될 때 쿼리 다시 불러오기
onActivated(() => {
  refetch();
});

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

const toggleTag = (tag: string) => {
  const tagTerm = `tag:${tag}`;
  const currentQuery = searchQuery.value.split(" ").filter((s) => s !== "");
  const index = currentQuery.indexOf(tagTerm);

  if (index > -1) {
    currentQuery.splice(index, 1);
  } else {
    currentQuery.push(tagTerm);
  }
  searchQuery.value = currentQuery.join(" ");
};

const toggleArtist = (artist: string) => {
  const artistTerm = `artist:${artist}`;
  const currentQuery = searchQuery.value.split(" ").filter((s) => s !== "");
  const index = currentQuery.indexOf(artistTerm);

  if (index > -1) {
    currentQuery.splice(index, 1);
  } else {
    currentQuery.push(artistTerm);
  }
  searchQuery.value = currentQuery.join(" ");
};

const toggleGroup = (group: string) => {
  const groupTerm = `group:${group}`;
  const currentQuery = searchQuery.value.split(" ").filter((s) => s !== "");
  const index = currentQuery.indexOf(groupTerm);

  if (index > -1) {
    currentQuery.splice(index, 1);
  } else {
    currentQuery.push(groupTerm);
  }
  searchQuery.value = currentQuery.join(" ");
};

const setSortBy = (column: string) => {
  sortBy.value = column;
};

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
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

useWindowEvent("keydown", (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "f") {
    e.preventDefault();
    searchInputRef.value?.focus();
  }
});

// 스크롤 위치 복원
useScrollRestoration(".flex-grow.overflow-y-auto");
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Icon icon="solar:library-bold-duotone" class="h-6 w-6" />
        <h2 class="text-2xl font-bold">라이브러리</h2>
        <HelpDialog
          title="라이브러리 도움말"
          description="라이브러리 사용법 및 검색 팁"
        >
          <template #trigger>
            <Button variant="ghost" size="icon">
              <Icon icon="solar:question-circle-bold-duotone" class="h-6 w-6" />
            </Button>
          </template>
          <div class="text-muted-foreground space-y-4 text-sm">
            <p>이 화면에서는 추가된 만화책들을 관리하고 열람할 수 있습니다.</p>
            <h3 class="text-foreground text-base font-semibold">검색 팁</h3>
            <ul class="list-inside list-disc">
              <li>
                검색창에 제목, 작가, 태그, 시리즈를 입력하여 검색할 수 있습니다.
              </li>
              <li><code>tag:태그명</code>: 특정 태그로 검색합니다.</li>
              <li><code>artist:작가명</code>: 특정 작가로 검색합니다.</li>
              <li><code>series:시리즈명</code>: 특정 시리즈로 검색합니다.</li>
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
                검색창 왼쪽의 드롭다운 메뉴를 사용하여 특정 라이브러리 폴더의
                책만 볼 수 있습니다.
              </li>
              <li>
                뷰어에서 이전/다음 책으로 이동 시, 라이브러리 화면에서 적용했던
                검색 및 필터 조건이 유지됩니다.
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
                책 카드를 <code>Ctrl</code>+클릭하거나 우클릭 메뉴의 '새 창으로
                열기'를 선택하여 뷰어를 새 창에서 열 수 있습니다.
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
      </div>
      <Button
        variant="secondary"
        size="icon"
        @click="router.push('/settings?tab=library')"
      >
        <Icon icon="solar:settings-bold-duotone" class="h-6 w-6" />
      </Button>
    </div>

    <!-- 검색 및 필터 영역 -->
    <div class="mb-4 flex items-center gap-2">
      <Select v-model="libraryPath">
        <SelectTrigger class="w-[280px]">
          <SelectValue placeholder="라이브러리 선택..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">모든 라이브러리</SelectItem>
          <SelectItem v-for="dir in libraryDirectories" :key="dir" :value="dir">
            {{ dir }}
          </SelectItem>
        </SelectContent>
      </Select>
      <SmartSearchInput
        ref="searchInputRef"
        v-model="searchQuery"
        placeholder="제목, 작가, 태그, 시리즈로 검색"
        class="flex-grow"
      />
      <PresetDropdown v-model="searchQuery" />
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline">
            <Icon icon="solar:filter-bold-duotone" class="h-4 w-4" />
            필터
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-56">
          <DropdownMenuLabel>읽음 상태</DropdownMenuLabel>
          <DropdownMenuRadioGroup v-model="readStatus">
            <DropdownMenuRadioItem value="all">모두</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="read">읽음</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="unread"
              >안 읽음</DropdownMenuRadioItem
            >
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>즐겨찾기</DropdownMenuLabel>
          <DropdownMenuRadioGroup v-model="isFavorite">
            <DropdownMenuRadioItem value="all">모두</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="favorite"
              >즐겨찾기만</DropdownMenuRadioItem
            >
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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
            <DropdownMenuItem @click="setSortBy('title')">
              제목
              <Icon
                v-if="sortBy === 'title'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('added_at')">
              추가된 날짜
              <Icon
                v-if="sortBy === 'added_at'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('last_read_at')">
              최근 읽음
              <Icon
                v-if="sortBy === 'last_read_at'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('artists')">
              작가
              <Icon
                v-if="sortBy === 'artists'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('page_count')">
              페이지 수
              <Icon
                v-if="sortBy === 'page_count'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('hitomi_id')">
              Hitomi ID
              <Icon
                v-if="sortBy === 'hitomi_id'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('random')">
              랜덤
              <Icon
                v-if="sortBy === 'random'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          class="rounded-l-none border-l-0"
          :disabled="sortBy === 'random'"
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
      <Button
        variant="outline"
        :disabled="books.length === 0"
        @click="openRandomBookFromCurrentView"
      >
        <Icon icon="solar:rocket-bold-duotone" class="h-4 w-4" />
        랜덤
      </Button>
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
    </div>

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
    <!-- Grid View -->
    <div
      v-else-if="books.length > 0 && viewMode === 'grid'"
      class="grid flex-grow grid-cols-1 items-start gap-4 overflow-y-auto sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
    >
      <BookCard
        v-for="book in books"
        :key="book.id"
        :book="book"
        :query-key="queryKey"
        @select-tag="toggleTag"
        @select-artist="toggleArtist"
        @select-group="toggleGroup"
        @toggle-favorite="handleToggleFavorite"
        @open-book-folder="handleOpenFolder"
        @show-details="handleShowDetails"
        @show-preview="handleShowPreview"
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
    <!-- List View -->
    <div
      v-else-if="books.length > 0 && viewMode === 'list'"
      class="flex flex-grow flex-col overflow-y-auto"
    >
      <BookRowCard
        v-for="book in books"
        :key="book.id"
        :book="book"
        :query-key="queryKey"
        @select-tag="toggleTag"
        @select-artist="toggleArtist"
        @select-group="toggleGroup"
        @toggle-favorite="handleToggleFavorite"
        @open-book-folder="handleOpenFolder"
        @show-details="handleShowDetails"
        @show-preview="handleShowPreview"
      />
      <div v-if="hasNextPage" ref="loader" class="p-4 text-center">
        <Button :disabled="isFetchingNextPage" @click="fetchNextPage">
          <Icon v-if="isFetchingNextPage" icon="svg-spinners:ring-resize" />
          <span>더 불러오기</span>
        </Button>
      </div>
    </div>
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
    <div
      v-else
      class="flex flex-grow flex-col items-center justify-center text-center"
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
  </div>
</template>
