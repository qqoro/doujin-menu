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
import { useVirtualCardList } from "@/composable/useVirtualCardList";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import ViewOptionsBar from "../common/ViewOptionsBar.vue";
import PageHeader from "../layout/PageHeader.vue";
import PageToolbar from "../layout/PageToolbar.vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import CoverCardShell from "../feature/parts/CoverCardShell.vue";
import RowCardShell from "../feature/parts/RowCardShell.vue";

interface HistoryItem {
  history_id: number;
  id: number;
  title: string;
  cover_path: string;
  viewed_at: string;
}

const router = useRouter();
const queryClient = useQueryClient();
const uiStore = useUiStore();

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
    queryClient.invalidateQueries({ queryKey: ["bookHistory-meta"] });
    queryClient.invalidateQueries({ queryKey: ["books"] });
  } catch (error) {
    console.error("기록 삭제 실패:", error);
  }
};

// 배치·줌·스크롤 복원은 useVirtualCardList가 담당한다. 여기는 데이터를 어떻게
// 가져올지만 알려준다

/** 청크 하나에 담는 기록 수. 기존 get-book-history pageSize와 같다 */
const CHUNK_SIZE = 50;

const {
  scrollerRef,
  updateVisibleRange,
  handleGridWheel,
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
} = useVirtualCardList<HistoryItem>({
  viewMode,
  chunkSize: CHUNK_SIZE,
  // 1건만 요청해 총 건수만 확보한다 (스크롤러 총 높이용)
  fetchTotal: async () => {
    const result = await getBookHistory({ pageParam: 0, pageSize: 1 });
    return result.total ?? 0;
  },
  fetchChunk: async (chunkIndex) => {
    const result = await getBookHistory({
      pageParam: chunkIndex,
      pageSize: CHUNK_SIZE,
      skipCount: true, // 총 건수는 메타 조회가 이미 갖고 있다
    });
    return (result.data ?? []) as HistoryItem[];
  },
  metaKey: () => ["bookHistory-meta"],
  chunkKey: (chunkIndex) => ["bookHistory", chunkIndex],
});

// 전체 기록 삭제
const isClearAllDialogOpen = ref(false);

const handleClearAll = () => {
  isClearAllDialogOpen.value = true;
};

const confirmClearAll = async () => {
  try {
    await clearBookHistory();
    toast.success("모든 기록 삭제 완료");
    queryClient.invalidateQueries({ queryKey: ["bookHistory"] });
    queryClient.invalidateQueries({ queryKey: ["bookHistory-meta"] });
    queryClient.invalidateQueries({ queryKey: ["books"] });
  } catch (error) {
    console.error("모든 기록 삭제 실패:", error);
    toast.error("모든 기록을 삭제하는 중 오류가 발생했습니다.");
  } finally {
    isClearAllDialogOpen.value = false;
  }
};

// 기록은 뷰어에서 추가되므로 이 화면이 스스로 알 방법이 없다. 청크 쿼리
// staleTime이 5분이라 재마운트만으로는 갱신되지 않아 브로드캐스트로 무효화한다
onMounted(() => {
  ipcRenderer.on("book-history-updated", () => {
    queryClient.invalidateQueries({ queryKey: ["bookHistory"] });
    queryClient.invalidateQueries({ queryKey: ["bookHistory-meta"] });
  });
});
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <PageHeader icon="solar:clock-circle-bold-duotone" title="읽음 기록">
      <template #actions>
        <Button
          variant="destructive"
          size="icon"
          :disabled="totalCount === 0"
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
          <!-- 리스트도 썸네일 px가 줌을 따라가므로 양쪽 다 줌을 켠다 -->
          <ViewOptionsBar v-model="viewMode" />
        </template>
      </PageToolbar>

      <!--
        스크롤러는 항상 마운트해야 한다. 조건부로 두면 virtualizer가 초기화
        시점에 스크롤 요소를 못 잡아 행이 하나도 안 그려진다.
      -->
      <div
        ref="scrollerRef"
        class="history-scroller relative min-h-0 flex-grow overflow-y-auto"
        @wheel="handleGridWheel"
        @scroll="updateVisibleRange"
      >
        <div v-if="isLoading" class="p-4 text-center">
          <p>읽음 기록을 불러오는 중...</p>
        </div>
        <div
          v-else-if="totalCount > 0"
          class="vspace relative w-full"
          :style="{ height: `${totalSize}px` }"
        >
          <!-- 그리드.
               기록은 열람 한 번이 한 칸이라, 같은 책을 여러 번 봤으면 그 횟수만큼
               나온다. 언제 몇 번 봤는지가 남는 게 이 화면의 목적이라 묶지 않는다 -->
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
                  <!-- 카드 골격은 라이브러리 그리드와 같은 CoverCardShell.
                       데이터는 기록 데이터만 있어 오버레이에 제목·본 시각만 그린다 -->
                  <CoverCardShell
                    v-if="itemAt(row.index * gridCols + col - 1)"
                    :cover-url="
                      getCoverUrl(
                        itemAt(row.index * gridCols + col - 1)!.cover_path,
                      )
                    "
                    :alt="itemAt(row.index * gridCols + col - 1)!.title"
                    @click="
                      goToBook(itemAt(row.index * gridCols + col - 1)!.id)
                    "
                  >
                    <template #overlay>
                      <p
                        class="line-clamp-2 text-[13px] leading-snug font-bold break-all [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]"
                        :title="itemAt(row.index * gridCols + col - 1)!.title"
                      >
                        {{ itemAt(row.index * gridCols + col - 1)!.title }}
                      </p>
                      <p class="mt-0.5 text-[11.5px] opacity-95">
                        {{
                          formatDate(
                            itemAt(row.index * gridCols + col - 1)!.viewed_at,
                          )
                        }}
                      </p>
                    </template>
                    <!--
                      기록만 지우는 버튼(책은 남는다). 카드 중앙은 책을 여는
                      자리라 오조작을 피해 구석에 붙인다
                    -->
                    <template #actions>
                      <Button
                        size="icon-sm"
                        variant="destructive"
                        class="absolute top-2 right-2"
                        title="기록 삭제"
                        aria-label="기록 삭제"
                        @click.stop="
                          handleDelete(
                            itemAt(row.index * gridCols + col - 1)!.history_id,
                          )
                        "
                      >
                        <Icon
                          icon="solar:trash-bin-trash-bold-duotone"
                          class="h-4 w-4"
                        />
                      </Button>
                    </template>
                  </CoverCardShell>
                  <!-- 아직 청크가 안 온 자리. 높이를 잡아둬야 행이 안 무너진다 -->
                  <div
                    v-else-if="row.index * gridCols + col - 1 < totalCount"
                    class="bg-muted aspect-[2/3] animate-pulse rounded-lg"
                  ></div>
                </template>
              </div>
            </div>
          </template>

          <!-- 리스트. 라이브러리와 같은 RowCardShell + 멀티컬럼 -->
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
                <RowCardShell
                  v-if="itemAt(row.index * listCols + col - 1)"
                  :cover-url="
                    getCoverUrl(
                      itemAt(row.index * listCols + col - 1)!.cover_path,
                    )
                  "
                  :alt="itemAt(row.index * listCols + col - 1)!.title"
                  @click="goToBook(itemAt(row.index * listCols + col - 1)!.id)"
                >
                  <template #content>
                    <h3 class="text-[15px] leading-snug font-bold">
                      {{ itemAt(row.index * listCols + col - 1)!.title }}
                    </h3>
                    <p class="text-muted-foreground text-[12.5px]">
                      {{
                        formatDate(
                          itemAt(row.index * listCols + col - 1)!.viewed_at,
                        )
                      }}
                    </p>
                  </template>
                  <template #actions>
                    <Button
                      variant="destructive"
                      size="icon"
                      class="mr-1 self-center"
                      aria-label="기록 삭제"
                      @click.stop="
                        handleDelete(
                          itemAt(row.index * listCols + col - 1)!.history_id,
                        )
                      "
                    >
                      <Icon
                        icon="solar:trash-bin-trash-bold-duotone"
                        class="h-5 w-5"
                      />
                    </Button>
                  </template>
                </RowCardShell>
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
