<script setup lang="ts">
import * as api from "@/api";
import { useOptimisticRating } from "@/composables/useOptimisticRating";
import { Icon } from "@iconify/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import type { Book } from "../../../../types/ipc";
import StarRating from "./StarRating.vue";

/** 라이브러리에 있는 책에만 붙는 정보 박스. 별점과 즐겨찾기는 여기서 바로 바꾼다 */
const props = defineProps<{ book: Book }>();

const queryClient = useQueryClient();

const { rating, setRating } = useOptimisticRating(
  () => props.book,
  async (bookId, value) => {
    await api.setBookRating(bookId, value);
    await queryClient.invalidateQueries({ queryKey: ["books"] });
  },
);

// 창이 받은 책은 연 시점의 사본이라 목록을 다시 불러와도 안 바뀐다. 직접 들고 있는다
const isFavorite = ref(!!props.book.is_favorite);
watch(
  () => props.book,
  (book) => {
    isFavorite.value = !!book.is_favorite;
  },
);

const toggleFavorite = async () => {
  const next = !isFavorite.value;
  isFavorite.value = next;
  try {
    await api.toggleBookFavorite(props.book.id, next);
    await queryClient.invalidateQueries({ queryKey: ["books"] });
  } catch (error) {
    isFavorite.value = !next;
    toast.error(`즐겨찾기 ${next ? "추가" : "해제"}에 실패했습니다.`, {
      description: (error as Error).message,
    });
  }
};

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString() : "";

const lastRead = computed(() => {
  const date = formatDate(props.book.last_read_at);
  if (!date) return "없음";
  const page = props.book.current_page ?? 0;
  const total = props.book.page_count ?? 0;
  return page > 0 && total > 0 ? `${date} · ${page}/${total}쪽` : date;
});

const displayPath = computed(() =>
  props.book.path.split(/[\\/]/).slice(0, -1).join("/"),
);
</script>

<template>
  <dl
    class="bg-muted/60 mt-3 grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2.5 text-sm"
  >
    <dt class="text-muted-foreground">별점</dt>
    <dd>
      <StarRating :model-value="rating" @update:model-value="setRating" />
    </dd>

    <dt class="text-muted-foreground">즐겨찾기</dt>
    <dd>
      <button
        type="button"
        class="flex cursor-pointer items-center"
        :aria-label="isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'"
        @click="toggleFavorite"
      >
        <Icon
          :icon="isFavorite ? 'solar:heart-bold' : 'solar:heart-linear'"
          class="h-4 w-4"
          :class="isFavorite ? 'text-rose-500' : 'text-muted-foreground'"
        />
      </button>
    </dd>

    <dt class="text-muted-foreground">추가된 날짜</dt>
    <dd>{{ formatDate(book.added_at) || "-" }}</dd>

    <dt class="text-muted-foreground">마지막 읽음</dt>
    <dd class="tabular-nums">{{ lastRead }}</dd>

    <dt class="text-muted-foreground self-start">경로</dt>
    <dd class="font-mono text-xs break-all">{{ displayPath }}</dd>
  </dl>
</template>
