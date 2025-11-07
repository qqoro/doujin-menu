<script setup lang="ts">
import { clearBookHistory, deleteBookHistory, getBookHistory } from "@/api";
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
import { Icon } from "@iconify/vue";
import { useInfiniteQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
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
    <div class="flex items-center justify-between">
      <h1 class="flex items-center gap-2 text-2xl font-bold">
        <Icon icon="solar:clock-circle-bold-duotone" class="h-7 w-7" />
        읽음 기록
      </h1>
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
    </div>
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
      <div v-else-if="allItems.length > 0" class="space-y-2">
        <div v-for="item in allItems" :key="item.history_id">
          <div
            class="hover:bg-accent/40 group flex cursor-pointer items-center rounded-md p-2"
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
              variant="outline"
              size="icon"
              class="ml-4 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              @click.stop="handleDelete(item.history_id)"
            >
              <Icon
                icon="solar:trash-bin-trash-bold-duotone"
                class="text-destructive h-5 w-5"
              />
            </Button>
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
