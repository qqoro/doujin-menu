<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icon } from "@iconify/vue";
import { ref, watch, computed } from "vue";
import { useMutation, useQuery } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { addBookToSeries, ipcRenderer } from "../../api";
import type { Book } from "../../../types/ipc";
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";

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

// 제외할 책 ID를 제외한 책 목록
const availableBooks = computed(() => {
  if (!booksData.value?.data) return [];
  return booksData.value.data.filter(
    (book: Book) => !props.excludeBookIds?.includes(book.id),
  );
});

// 책 추가 뮤테이션
const addMutation = useMutation({
  mutationFn: ({ bookId, seriesId }: { bookId: number; seriesId: number }) =>
    addBookToSeries(bookId, seriesId),
  onSuccess: () => {
    toast.success("책이 시리즈에 추가되었습니다");
    emit("added");
    emit("update:open", false);
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
    }
  },
);

// 책 선택
const handleSelectBook = (bookId: number) => {
  if (!props.seriesId) return;
  addMutation.mutate({ bookId, seriesId: props.seriesId });
};
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[80vh] max-w-[600px] flex-col">
      <DialogHeader>
        <DialogTitle>시리즈에 책 추가</DialogTitle>
        <DialogDescription>
          추가할 책을 검색하여 선택하세요
        </DialogDescription>
      </DialogHeader>

      <!-- 검색 -->
      <div class="space-y-4">
        <SmartSearchInput
          v-model="searchQuery"
          placeholder="제목, artist:, tag:, type: 등으로 검색..."
        />

        <!-- 책 목록 -->
        <ScrollArea class="h-[400px]">
          <div v-if="isLoading" class="py-8 text-center">
            <Icon icon="svg-spinners:ring-resize" class="mx-auto h-8 w-8" />
          </div>

          <div v-else-if="availableBooks.length === 0" class="py-8 text-center">
            <p class="text-muted-foreground text-sm">
              추가할 수 있는 책이 없습니다
            </p>
          </div>

          <div v-else class="space-y-2 pr-4">
            <button
              v-for="book in availableBooks"
              :key="book.id"
              class="hover:bg-accent w-full rounded-lg border p-3 text-left transition-colors"
              :disabled="addMutation.isPending.value"
              @click="handleSelectBook(book.id)"
            >
              <div class="font-medium">{{ book.title }}</div>
              <div class="text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                <span class="flex items-center gap-1">
                  <Icon icon="solar:document-text-bold-duotone" class="h-3.5 w-3.5" />
                  {{ book.page_count }}페이지
                </span>
                <span
                  v-if="book.artists && book.artists.length > 0"
                  class="flex items-center gap-1"
                >
                  <Icon icon="solar:user-bold-duotone" class="h-3.5 w-3.5" />
                  {{ book.artists.map((a) => a.name).join(", ") }}
                </span>
                <span
                  v-if="book.groups && book.groups.length > 0"
                  class="flex items-center gap-1"
                >
                  <Icon icon="solar:users-group-rounded-bold-duotone" class="h-3.5 w-3.5" />
                  {{ book.groups.map((g) => g.name).join(", ") }}
                </span>
              </div>
            </button>
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>
</template>
