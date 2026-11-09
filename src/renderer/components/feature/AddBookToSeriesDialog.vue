<script setup lang="ts">
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icon } from "@iconify/vue";
import { useMutation, useQuery } from "@tanstack/vue-query";
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

// 검색어
const searchQuery = ref("");
const currentPage = ref(1);

// 책 검색
const { data: booksData, isLoading } = useQuery({
  queryKey: computed(() => [
    "booksForSeries",
    searchQuery.value,
    currentPage.value,
  ]),
  queryFn: () =>
    ipcRenderer.invoke("get-books", {
      searchQuery: searchQuery.value,
      pageParam: currentPage.value - 1,
      pageSize: 20,
    }),
  enabled: computed(() => props.open),
});

/**
 * 이 창에서 방금 추가한 책. 부모의 excludeBookIds는 시리즈 목록을 다시 받은 뒤에야
 * 바뀌므로, 그 사이 같은 책을 또 눌러 두 번 추가되지 않게 바로 숨긴다
 */
const addedIds = ref(new Set<number>());

// 시리즈에 이미 있는 책과 방금 추가한 책을 뺀 목록
const availableBooks = computed(() => {
  if (!booksData.value?.data) return [];
  return booksData.value.data.filter(
    (book: Book) =>
      !props.excludeBookIds?.includes(book.id) && !addedIds.value.has(book.id),
  );
});

// 여러 권을 이어서 넣을 수 있게 추가해도 창을 닫지 않는다
const addMutation = useMutation({
  mutationFn: ({ bookId, seriesId }: { bookId: number; seriesId: number }) =>
    addBookToSeries(bookId, seriesId),
  onSuccess: (_result, { bookId }) => {
    addedIds.value = new Set(addedIds.value).add(bookId);
    const title = booksData.value?.data.find(
      (book: Book) => book.id === bookId,
    )?.title;
    toast.success("시리즈에 추가했습니다", { description: title });
    emit("added");
  },
  onError: (error) => {
    toast.error(`추가 실패: ${error.message}`);
  },
});

// 다이얼로그 열릴 때 초기화
watch(
  () => props.open,
  (open) => {
    if (open) {
      searchQuery.value = "";
      currentPage.value = 1;
      addedIds.value = new Set();
    }
  },
);

// 책 선택
const handleSelectBook = (bookId: number) => {
  if (!props.seriesId || addMutation.isPending.value) return;
  addMutation.mutate({ bookId, seriesId: props.seriesId });
};
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

      <!-- 검색 -->
      <div class="space-y-4">
        <SmartSearchInput
          v-model="searchQuery"
          placeholder="제목, artist:, tag:, type: 등으로 검색..."
        />

        <!-- 책 목록 -->
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
              @open="handleSelectBook(book.id)"
            >
              <template #actions />
            </BookRowCard>
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>
</template>
