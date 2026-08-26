<script setup lang="ts">
import PreviewDialogShell from "@/components/common/PreviewDialogShell.vue";
import { computed } from "vue";
import type { Book } from "../../../types/ipc";

const props = defineProps<{
  open: boolean;
  book: Book | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const artists = computed(
  () => props.book?.artists?.map((artist) => artist.name) ?? [],
);

const tags = computed(() => props.book?.tags ?? []);

/** 로컬 책은 페이지 수만 알면 URL이 정해진다. 따로 조회하지 않는다 */
const urls = computed(() => {
  const book = props.book;
  if (!book) return [];
  return Array.from(
    { length: book.page_count ?? 0 },
    (_, index) => `doujin-menu://${book.id}/${index}`,
  );
});
</script>

<template>
  <PreviewDialogShell
    :open="open"
    :title="book?.title || 'N/A'"
    :artists="artists"
    :tags="tags"
    :urls="urls"
    :has-target="!!book"
    empty-message="선택된 책이 없습니다."
    @update:open="emit('update:open', $event)"
  >
    <template #scroll-image="{ url, index, loaded }">
      <img
        v-if="loaded"
        :src="url"
        :alt="`Preview Image ${index + 1}`"
        class="max-h-full w-auto object-contain"
        loading="lazy"
      />
      <div v-else class="bg-muted flex h-full w-64 items-center justify-center">
        <p class="text-muted-foreground text-sm">로딩 중...</p>
      </div>
    </template>

    <template #grid-image="{ url, index, loaded }">
      <img
        v-if="loaded"
        :src="url"
        :alt="`Preview Image ${index + 1}`"
        class="aspect-[3/4] w-full object-cover transition-transform duration-200 hover:scale-105"
        loading="lazy"
      />
      <div
        v-else
        class="bg-muted flex aspect-[3/4] w-full items-center justify-center"
      >
        <p class="text-muted-foreground text-sm">로딩 중...</p>
      </div>
    </template>
  </PreviewDialogShell>
</template>
