<script setup lang="ts">
import {
  clearBookHistory,
  deleteBookHistory,
  getBookHistory,
  ipcRenderer,
} from "@/api";
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
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import ViewOptionsBar from "../common/ViewOptionsBar.vue";
import PageHeader from "../layout/PageHeader.vue";
import PageToolbar from "../layout/PageToolbar.vue";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";

interface HistoryItem {
  history_id: number;
  id: number;
  title: string;
  cover_path: string;
  viewed_at: string;
}

const router = useRouter();
const queryClient = useQueryClient();

const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
  useInfiniteQuery({
    queryKey: ["bookHistory"],
    queryFn: ({ pageParam = 0 }) => getBookHistory({ pageParam }),
    getNextPageParam: (lastPage) => {
      if (lastPage.hasNextPage) {
        return lastPage.nextPage;
      }
      return undefined;
    },
    initialPageParam: 0,
  });

const allItems = computed<HistoryItem[]>(
  () =>
    data.value?.pages
      .flatMap((page) => page.data)
      .filter((item): item is HistoryItem => item !== undefined) ?? [],
);

const scrollContainerRef = ref<HTMLElement | null>(null);
const isClearAllDialogOpen = ref(false);

const uiStore = useUiStore();

// 그리드 카드의 최소 폭과 간격. 라이브러리 그리드와 같은 값을 써서 두 화면의
// 카드 크기가 어긋나지 않게 한다
const MIN_CARD_WIDTH = 184;
const GRID_GAP = 12;

// 뷰 모드는 설정에 저장해 다음에 들어와도 유지한다
const viewMode = ref<"grid" | "list">("grid");

const { data: config, isSuccess: isConfigLoaded } = useQuery({
  queryKey: ["config"],
  queryFn: () => ipcRenderer.invoke("get-config"),
});

// 설정에서 불러오는 최초 1회는 저장을 유발하면 안 되므로 플래그로 막는다
const isViewModeInitialized = ref(false);

watch(
  isConfigLoaded,
  (loaded) => {
    if (!loaded) return;
    viewMode.value = config.value?.historyViewSettings?.viewMode ?? "grid";
    nextTick(() => {
      isViewModeInitialized.value = true;
    });
  },
  { immediate: true },
);

watch(viewMode, async (mode) => {
  if (!isViewModeInitialized.value) return;
  await ipcRenderer.invoke("set-config", {
    key: "historyViewSettings",
    value: { viewMode: mode },
  });
  queryClient.invalidateQueries({ queryKey: ["config"] });
});

function formatDate(dateString: string) {
  // DB에서 UTC로 저장된 시간을 Local Time으로 변환하기 위해 'Z'를 추가합니다.
  const date = new Date(`${dateString.replace(" ", "T")}Z`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (date >= today) {
    return `오늘 ${timeFormatter.format(date)}`;
  }
  if (date >= yesterday) {
    return `어제 ${timeFormatter.format(date)}`;
  }

  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return dateFormatter.format(date);
}

function handleScroll() {
  const container = scrollContainerRef.value;
  if (container) {
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (
      scrollTop + clientHeight >= scrollHeight - 100 &&
      hasNextPage.value &&
      !isFetchingNextPage.value
    ) {
      fetchNextPage();
    }
  }
}

const goToBook = (bookId: number) => {
  router.push({ name: "Viewer", params: { id: bookId } });
};

const getCoverUrl = (coverPath: string) => {
  return coverPath
    ? `file://${coverPath}`
    : "https://via.placeholder.com/256x384";
};

const handleDelete = async (historyId: number) => {
  try {
    await deleteBookHistory(historyId);
    queryClient.invalidateQueries({ queryKey: ["bookHistory"] });
    queryClient.invalidateQueries({ queryKey: ["books"] });
  } catch (error) {
    console.error("기록 삭제 실패:", error);
  }
};

const handleClearAll = () => {
  isClearAllDialogOpen.value = true;
};

const confirmClearAll = async () => {
  try {
    await clearBookHistory();
    toast.success("모든 기록 삭제 완료");
    queryClient.invalidateQueries({ queryKey: ["bookHistory"] });
    queryClient.invalidateQueries({ queryKey: ["books"] });
  } catch (error) {
    console.error("모든 기록 삭제 실패:", error);
    toast.error("모든 기록을 삭제하는 중 오류가 발생했습니다.");
  } finally {
    isClearAllDialogOpen.value = false;
  }
};
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <PageHeader icon="solar:clock-circle-bold-duotone" title="읽음 기록">
      <template #actions>
        <Button
          variant="destructive"
          size="icon"
          :disabled="allItems.length === 0"
          @click="handleClearAll"
        >
          <Icon
            icon="solar:trash-bin-minimalistic-bold-duotone"
            class="h-5 w-5"
          />
        </Button>
      </template>
    </PageHeader>

    <!-- 검색·필터는 없지만 뷰 옵션은 다른 화면과 같은 자리에 둔다 -->
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <PageToolbar>
        <template #view>
          <!-- 리스트 뷰는 줌을 쓰지 않아 그리드에서만 켠다 -->
          <ViewOptionsBar
            v-model="viewMode"
            :zoom-disabled="viewMode !== 'grid'"
          />
        </template>
      </PageToolbar>

      <div
        ref="scrollContainerRef"
        class="flex-grow overflow-y-auto pr-4"
        @scroll="handleScroll"
      >
        <div v-if="status === 'pending'" class="p-4 text-center">
          <p>읽음 기록을 불러오는 중...</p>
        </div>
        <div
          v-else-if="status === 'error'"
          class="text-destructive p-4 text-center"
        >
          <p>오류가 발생했습니다.</p>
        </div>
        <div v-else-if="allItems.length > 0">
          <!-- 그리드: 표지를 크게 본다.
             기록은 열람 한 번이 한 칸이라, 같은 책을 여러 번 봤으면 그 횟수만큼
             나온다. 언제 몇 번 봤는지가 남는 게 이 화면의 목적이라 묶지 않는다.
             줌은 라이브러리와 같은 방식(컨테이너에 zoom)으로 건다 -->
          <div
            v-if="viewMode === 'grid'"
            class="zoomed grid items-start"
            :style="{
              zoom: uiStore.thumbnailZoom,
              gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_CARD_WIDTH}px, 1fr))`,
              gap: `${GRID_GAP}px`,
            }"
          >
            <div
              v-for="item in allItems"
              :key="item.history_id"
              class="hover:bg-accent/40 relative cursor-pointer rounded-md p-2"
              @click="goToBook(item.id)"
            >
              <img
                :src="getCoverUrl(item.cover_path)"
                class="aspect-[3/4] w-full rounded-md object-cover"
              />
              <p class="mt-2 truncate font-semibold" :title="item.title">
                {{ item.title }}
              </p>
              <p class="text-muted-foreground text-sm">
                {{ formatDate(item.viewed_at) }}
              </p>
              <!-- 라이브러리 카드의 삭제와 달리 여기서는 기록만 지운다 -->
              <Button
                variant="destructive"
                size="icon"
                class="absolute top-3 right-3"
                aria-label="기록 삭제"
                @click.stop="handleDelete(item.history_id)"
              >
                <Icon
                  icon="solar:trash-bin-trash-bold-duotone"
                  class="h-5 w-5"
                />
              </Button>
            </div>
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in allItems" :key="item.history_id">
              <div
                class="hover:bg-accent/40 flex cursor-pointer items-center rounded-md p-2"
                @click="goToBook(item.id)"
              >
                <img
                  :src="getCoverUrl(item.cover_path)"
                  class="h-20 w-16 flex-shrink-0 rounded-md object-cover"
                />
                <div class="ml-4 min-w-0 flex-grow">
                  <p class="truncate font-semibold">{{ item.title }}</p>
                  <p class="text-muted-foreground text-sm">
                    {{ formatDate(item.viewed_at) }}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  class="ml-4 flex-shrink-0"
                  aria-label="기록 삭제"
                  @click.stop="handleDelete(item.history_id)"
                >
                  <Icon
                    icon="solar:trash-bin-trash-bold-duotone"
                    class="h-5 w-5"
                  />
                </Button>
              </div>
            </div>
          </div>

          <div v-if="isFetchingNextPage" class="p-4 text-center">
            <p>더 많은 기록을 불러오는 중...</p>
          </div>
        </div>
        <div v-else class="p-4 text-center">
          <p>읽음 기록이 없습니다.</p>
        </div>
      </div>
    </div>

    <AlertDialog
      :open="isClearAllDialogOpen"
      @update:open="isClearAllDialogOpen = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>모든 기록을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            이 작업은 되돌릴 수 없습니다. 모든 읽음 기록이 영구적으로
            삭제됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction @click="confirmClearAll">삭제</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
