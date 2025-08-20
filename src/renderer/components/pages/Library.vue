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
import { useQueryAndParams } from "@/composable/useQueryAndParams";
import { useWindowEvent } from "@/composable/useWindowEvent";
import { Icon } from "@iconify/vue";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import { debouncedWatch } from "@vueuse/core";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { ipcRenderer, openBookFolder, toggleBookFavorite } from "../../api";
import PresetDropdown from "../common/PresetDropdown.vue";
import SmartSearchInput from "../common/SmartSearchInput.vue";
import BookCard from "../feature/BookCard.vue";
import BookDetailDialog from "../feature/BookDetailDialog.vue";

interface Tag {
  name: string;
}

interface Artist {
  name: string;
}

interface Group {
  name: string;
}

interface Character {
  name: string;
}

interface Book {
  id: number;
  title: string;
  volume: number | null;
  path: string;
  cover_path: string | null;
  page_count: number;
  added_at: string;
  last_read_at: string | null;
  current_page: number | null;
  is_favorite: boolean;
  hitomi_id?: string | null;
  series_name?: string;
  artists?: Artist[];
  tags?: Tag[];
  groups?: Group[];
  characters?: Character[];
  type?: string | null;
  language_name_english?: string | null;
  language_name_local?: string | null;
}

const queryClient = useQueryClient();

const route = useRoute();
const router = useRouter();
const loader = ref(null);
const searchInputRef = ref<InstanceType<typeof SmartSearchInput> | null>(null);

const showBookDetailDialog = ref(false);
const selectedBook = ref<Book | null>(null);

// Filter and Sort State
const libraryPath = ref((route.query.libraryPath as string) || "all");
const readStatus = ref((route.query.readStatus as string) || "all");
const isFavorite = ref((route.query.isFavorite as string) || "all");
const sortBy = ref((route.query.sortBy as string) || "added_at");
const sortOrder = ref((route.query.sortOrder as string) || "desc");
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

// Load settings when config is loaded
watch(
  isConfigLoaded,
  (loaded) => {
    const query = route.query;
    if (query.sortBy || query.sortOrder || query.readStatus) {
      return;
    }

    if (loaded && config.value && config.value.libraryViewSettings) {
      const {
        sortBy: savedSortBy,
        sortOrder: savedSortOrder,
        readStatus: savedReadStatus,
      } = config.value.libraryViewSettings;
      sortBy.value = savedSortBy;
      sortOrder.value = savedSortOrder;
      readStatus.value = savedReadStatus;
    }
  },
  { immediate: true },
);

// Watch for filter/sort changes and save them
debouncedWatch(
  [sortBy, sortOrder, readStatus],
  () => {
    if (!isConfigLoaded.value) return;

    const settings = {
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      readStatus: readStatus.value,
    };
    ipcRenderer.invoke("set-config", {
      key: "libraryViewSettings",
      value: settings,
    });
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

const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
  useInfiniteQuery({
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
  });

const books = computed(
  () => data.value?.pages.flatMap((page) => page.data) ?? [],
);

onMounted(() => {
  ipcRenderer.on("books-updated", () =>
    queryClient.invalidateQueries({ queryKey: ["books"] }),
  );
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

const setSortBy = (column: string) => {
  sortBy.value = column;
};

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
};

const openRandomBook = async () => {
  const result = await ipcRenderer.invoke("get-random-book");
  if (result.success && result.bookId) {
    router.push({ name: "Viewer", params: { id: result.bookId } });
  } else {
    console.error("Failed to get random book:", result.error);
    toast.error("랜덤 책을 불러오는데 실패했습니다.");
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

useWindowEvent("keydown", (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "f") {
    e.preventDefault();
    searchInputRef.value?.focus();
  }
});
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center gap-2">
        <Icon icon="solar:library-bold-duotone" class="w-6 h-6" />
        <h2 class="text-2xl font-bold">라이브러리</h2>
        <HelpDialog
          title="라이브러리 도움말"
          description="라이브러리 사용법 및 검색 팁"
        >
          <template #trigger>
            <Button variant="ghost" size="icon">
              <Icon icon="solar:question-circle-bold-duotone" class="w-6 h-6" />
            </Button>
          </template>
          <div class="space-y-4 text-sm text-muted-foreground">
            <p>이 화면에서는 추가된 만화책들을 관리하고 열람할 수 있습니다.</p>
            <h3 class="font-semibold text-base text-foreground">검색 팁</h3>
            <ul class="list-disc list-inside">
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
                  class="w-4 h-4 inline-block align-text-bottom"
                />
                버튼을 클릭하여 저장된 프리셋 검색어를 사용할 수 있습니다.
              </li>
            </ul>
            <h3 class="font-semibold text-base text-foreground">
              필터 및 정렬
            </h3>
            <ul class="list-disc list-inside">
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
                  class="w-4 h-4 inline-block align-text-bottom"
                />
                버튼을 클릭하여 읽음 상태 및 즐겨찾기 여부로 필터링할 수
                있습니다.
              </li>
              <li>
                <Icon
                  icon="solar:sort-bold-duotone"
                  class="w-4 h-4 inline-block align-text-bottom"
                />
                버튼을 클릭하여 다양한 기준으로 정렬할 수 있습니다.
              </li>
            </ul>
            <h3 class="font-semibold text-base text-foreground">책 관리</h3>
            <ul class="list-disc list-inside">
              <li>
                책 카드를 클릭하여 상세 정보를 확인하고 열람할 수 있습니다.
              </li>
              <li>
                책 카드 우클릭 메뉴를 통해 폴더 열기, 즐겨찾기 추가/해제 등의
                작업을 할 수 있습니다.
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
        <Icon icon="solar:settings-bold-duotone" class="w-6 h-6" />
      </Button>
    </div>

    <!-- 검색 및 필터 영역 -->
    <div class="flex items-center gap-2 mb-4">
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
            <Icon icon="solar:filter-bold-duotone" class="w-4 h-4" />
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
      <div class="inline-flex rounded-md shadow-sm" role="group">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="rounded-r-none">
              <Icon icon="solar:sort-bold-duotone" class="w-4 h-4" />
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
                class="w-4 h-4 ml-auto"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('added_at')">
              추가된 날짜
              <Icon
                v-if="sortBy === 'added_at'"
                icon="solar:check-circle-bold-duotone"
                class="w-4 h-4 ml-auto"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('last_read_at')">
              최근 읽음
              <Icon
                v-if="sortBy === 'last_read_at'"
                icon="solar:check-circle-bold-duotone"
                class="w-4 h-4 ml-auto"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('artists')">
              작가
              <Icon
                v-if="sortBy === 'artists'"
                icon="solar:check-circle-bold-duotone"
                class="w-4 h-4 ml-auto"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('page_count')">
              페이지 수
              <Icon
                v-if="sortBy === 'page_count'"
                icon="solar:check-circle-bold-duotone"
                class="w-4 h-4 ml-auto"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('hitomi_id')">
              Hitomi ID
              <Icon
                v-if="sortBy === 'hitomi_id'"
                icon="solar:check-circle-bold-duotone"
                class="w-4 h-4 ml-auto"
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
            class="w-4 h-4"
          />
          <Icon
            v-else
            icon="solar:sort-from-top-to-bottom-bold-duotone"
            class="w-4 h-4"
          />
        </Button>
      </div>
      <Button variant="outline" @click="openRandomBook">
        <Icon icon="solar:rocket-bold-duotone" class="w-4 h-4" />
        랜덤
      </Button>
    </div>

    <div
      v-if="isLoading"
      class="flex-grow flex flex-col items-center justify-center text-center"
    >
      <div
        class="text-lg text-muted-foreground mb-4 flex justify-center items-center flex-col gap-2"
      >
        <Icon icon="svg-spinners:ring-resize" class="size-8" />
        <p>로딩중...</p>
      </div>
    </div>
    <div
      v-else-if="books.length > 0"
      class="flex-grow overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 items-start"
    >
      <BookCard
        v-for="book in books"
        :key="book.id"
        :book="book"
        :query-key="queryKey"
        @select-tag="toggleTag"
        @select-artist="toggleArtist"
        @toggle-favorite="handleToggleFavorite"
        @open-book-folder="handleOpenFolder"
        @show-details="handleShowDetails"
      />
      <div
        v-if="hasNextPage"
        ref="loader"
        class="text-center p-4 col-span-full"
      >
        <Button :disabled="isFetchingNextPage" @click="fetchNextPage">
          <Icon v-if="isFetchingNextPage" icon="svg-spinners:ring-resize" />
          <span>더 불러오기</span>
        </Button>
      </div>
    </div>
    <div
      v-else-if="searchQuery.trim().length > 0"
      class="flex-grow flex flex-col items-center justify-center text-center"
    >
      <div
        class="text-lg text-muted-foreground mb-4 flex justify-center items-center flex-col gap-2"
      >
        <p>검색된 데이터가 없습니다.</p>
      </div>
    </div>
    <div
      v-else
      class="flex-grow flex flex-col items-center justify-center text-center"
    >
      <div
        class="text-lg text-muted-foreground mb-4 flex justify-center items-center flex-col"
      >
        <p>등록된 라이브러리/책이 없습니다.</p>
        <p class="flex justify-center items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            @click="router.push('/settings?tab=library')"
          >
            <Icon icon="solar:settings-bold-duotone" class="w-5 h-5" />
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
  </div>
</template>
