<script setup lang="ts">
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@iconify/vue";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/vue-query";
import { useIntersectionObserver } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import type { Book } from "../../../types/ipc";
import { addBookToSeries, ipcRenderer } from "../../api";
import BookRowCard from "./BookRowCard.vue";

interface Props {
  open: boolean;
  seriesId: number | null;
  excludeBookIds?: number[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  added: [];
}>();

/** 카드의 "새 창으로 열기"가 두 번째 값을 뷰어 필터로 넘긴다. 없으면 파싱에 실패한다 */
const BOOK_CARD_QUERY_KEY = ["booksForSeries", {}] as const;
const PAGE_SIZE = 50;

const queryClient = useQueryClient();

const searchQuery = ref("");
/** 꺼져 있으면 시리즈 없는 책만 보여서, 다른 시리즈 책을 실수로 빼 올 일이 없다 */
const showOtherSeries = ref(false);

const {
  data: booksData,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
} = useInfiniteQuery({
  queryKey: computed(() => [
    "booksForSeries",
    searchQuery.value,
    props.seriesId,
    showOtherSeries.value,
  ]),
  queryFn: ({ pageParam }) =>
    ipcRenderer.invoke("get-books", {
      searchQuery: searchQuery.value,
      pageParam,
      pageSize: PAGE_SIZE,
      ...(showOtherSeries.value
        ? { excludeSeriesId: props.seriesId ?? undefined }
        : { unassignedOnly: true }),
    }),
  initialPageParam: 0,
  getNextPageParam: (lastPage) =>
    lastPage.hasNextPage ? lastPage.nextPage : undefined,
  enabled: computed(() => props.open),
});

/**
 * 이 창에서 방금 추가한 책. 목록을 다시 받기 전까지는 서버 필터가 반영되지
 * 않으므로, 그 사이 같은 책을 또 눌러 두 번 추가되지 않게 바로 숨긴다
 */
const addedIds = ref(new Set<number>());

const availableBooks = computed(() => {
  const books = booksData.value?.pages.flatMap((page) => page.data) ?? [];
  return books.filter(
    (book) =>
      !props.excludeBookIds?.includes(book.id) && !addedIds.value.has(book.id),
  );
});

const totalCount = computed(() => booksData.value?.pages[0]?.totalCount);

// 목록 끝의 감시용 요소가 보이면 다음 페이지를 받는다
const loadMoreTrigger = ref<HTMLElement | null>(null);
useIntersectionObserver(loadMoreTrigger, ([entry]) => {
  if (entry?.isIntersecting && hasNextPage.value && !isFetchingNextPage.value) {
    fetchNextPage();
  }
});

const isInOtherSeries = (book: Book) =>
  !!book.series_collection_id && book.series_collection_id !== props.seriesId;

// 여러 권을 이어서 넣을 수 있게 추가해도 창을 닫지 않는다
const addMutation = useMutation({
  mutationFn: ({ book, seriesId }: { book: Book; seriesId: number }) =>
    addBookToSeries(book.id, seriesId),
  onSuccess: (_result, { book }) => {
    addedIds.value = new Set(addedIds.value).add(book.id);
    toast.success("시리즈에 추가했습니다", { description: book.title });
    emit("added");
  },
  onError: (error) => {
    toast.error(`추가 실패: ${error.message}`);
  },
});

/**
 * 다른 시리즈에서 옮겨 올 책. 확인을 받아야 추가한다.
 * 열림 상태를 따로 둔다. AlertDialogAction은 클릭 핸들러보다 닫힘 이벤트가
 * 먼저 와서, 닫힐 때 이 값을 비우면 "옮기기"가 빈 값을 받는다
 */
const pendingMove = ref<{ book: Book; fromName: string } | null>(null);
const isMoveDialogOpen = ref(false);

const handleSelectBook = async (book: Book) => {
  if (!props.seriesId || addMutation.isPending.value) return;

  if (isInOtherSeries(book)) {
    let fromName = "다른 시리즈";
    try {
      const result = await ipcRenderer.invoke(
        "get-series-collection-by-id",
        book.series_collection_id!,
      );
      if (result.data?.name) fromName = result.data.name;
    } catch {
      // 이름을 못 가져와도 확인은 받는다
    }
    pendingMove.value = { book, fromName };
    isMoveDialogOpen.value = true;
    return;
  }

  addMutation.mutate({ book, seriesId: props.seriesId });
};

const confirmMove = () => {
  if (pendingMove.value && props.seriesId) {
    addMutation.mutate({
      book: pendingMove.value.book,
      seriesId: props.seriesId,
    });
  }
  isMoveDialogOpen.value = false;
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      searchQuery.value = "";
      showOtherSeries.value = false;
      addedIds.value = new Set();
    } else {
      // 다시 열 때 지난번에 넘겨 둔 페이지들을 전부 다시 받지 않게 비운다
      queryClient.removeQueries({ queryKey: ["booksForSeries"] });
    }
  },
);
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[85vh] flex-col sm:max-w-[760px]">
      <DialogHeader>
        <DialogTitle>시리즈에 책 추가</DialogTitle>
        <DialogDescription>
          책을 누르면 바로 추가됩니다. 창을 닫지 않고 여러 권을 이어서 추가할 수
          있습니다.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <SmartSearchInput
          v-model="searchQuery"
          placeholder="제목, artist:, tag:, type: 등으로 검색..."
        />

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <Switch id="show-other-series" v-model="showOtherSeries" />
            <Label for="show-other-series" class="text-sm">
              다른 시리즈에 들어 있는 책도 보기
            </Label>
          </div>
          <span
            v-if="totalCount !== undefined"
            class="text-muted-foreground text-xs"
          >
            {{ totalCount.toLocaleString() }}권
          </span>
        </div>

        <ScrollArea class="h-[60vh]">
          <div v-if="isLoading" class="py-8 text-center">
            <Icon icon="svg-spinners:ring-resize" class="mx-auto h-8 w-8" />
          </div>

          <div v-else-if="availableBooks.length === 0" class="py-8 text-center">
            <p class="text-muted-foreground text-sm">
              추가할 수 있는 책이 없습니다
            </p>
          </div>

          <div v-else class="space-y-2 pr-4">
            <BookRowCard
              v-for="book in availableBooks"
              :key="book.id"
              :book="book"
              :query-key="BOOK_CARD_QUERY_KEY"
              @open="handleSelectBook(book)"
            >
              <template #actions>
                <Badge
                  v-if="isInOtherSeries(book)"
                  variant="secondary"
                  class="shrink-0 self-start"
                >
                  다른 시리즈
                </Badge>
              </template>
            </BookRowCard>

            <div ref="loadMoreTrigger" class="h-8">
              <Icon
                v-if="isFetchingNextPage"
                icon="svg-spinners:ring-resize"
                class="mx-auto h-5 w-5"
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>

  <AlertDialog
    :open="isMoveDialogOpen"
    @update:open="isMoveDialogOpen = $event"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>다른 시리즈에서 옮길까요?</AlertDialogTitle>
        <AlertDialogDescription>
          "{{ pendingMove?.book.title }}"은(는) 이미 "{{
            pendingMove?.fromName
          }}" 시리즈에 들어 있습니다. 이 시리즈로 옮기면 원래 시리즈에서
          빠집니다.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction @click="confirmMove">옮기기</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
