<script setup lang="ts">
import * as api from "@/api";
import PreviewDialogShell from "@/components/common/PreviewDialogShell.vue";
import { Button } from "@/components/ui/button";
import {
  buildBookMetaLine,
  buildCoverUrl,
  toBookDetailSource,
} from "@/lib/bookCard";
import { buildDetailRows } from "@/lib/galleryCard";
import { toMediaUrl } from "@/lib/mediaUrl";
import { Icon } from "@iconify/vue";
import { computed, toRaw } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type { Book } from "../../../types/ipc";
import BookInfoPanel from "./parts/BookInfoPanel.vue";
import LibraryBookExtras from "./parts/LibraryBookExtras.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    book: Book | null;
    /**
     * 뷰어에 넘길 목록 조건. 뷰어의 이전/다음 책이 이 조건을 따른다.
     * 없으면 조건 없이 연다
     */
    viewerFilter?: object | null;
    /** 읽기 버튼을 보일지. 뷰어 안에서 열면 이미 읽는 중이라 숨긴다 */
    readable?: boolean;
  }>(),
  { viewerFilter: null, readable: true },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const router = useRouter();

const metaParts = computed(() =>
  props.book ? buildBookMetaLine(props.book, ["pages"]) : [],
);
const rows = computed(() =>
  props.book ? buildDetailRows(toBookDetailSource(props.book)) : [],
);

/** 로컬 책은 페이지 수만 알면 URL이 정해진다. 따로 조회하지 않는다 */
const urls = computed(() => {
  const book = props.book;
  if (!book) return [];
  return Array.from({ length: book.page_count ?? 0 }, (_, index) =>
    toMediaUrl(`doujin-menu://${book.id}/${index}`),
  );
});

const handleRead = (event: MouseEvent) => {
  const book = props.book;
  if (!book) return;
  if (book.is_offline) {
    toast.warning("라이브러리 폴더에 접근할 수 없습니다.", {
      description: "해당 폴더에 접근할 수 있는지 확인한 후 다시 스캔해 주세요.",
    });
    return;
  }

  const query = props.viewerFilter
    ? { filter: JSON.stringify(toRaw(props.viewerFilter)) }
    : undefined;
  // Ctrl/Cmd 클릭은 새 창으로 열고 이 창은 그대로 둔다
  if (event.ctrlKey || event.metaKey) {
    const search = query ? `?${new URLSearchParams(query).toString()}` : "";
    api.openNewWindow(`/viewer/${book.id}${search}`);
    return;
  }
  emit("update:open", false);
  router.push({ name: "Viewer", params: { id: book.id }, query });
};
</script>

<template>
  <PreviewDialogShell
    :open="open"
    :title="book?.title"
    :urls="urls"
    :has-target="!!book"
    empty-message="선택된 책이 없습니다."
    @update:open="emit('update:open', $event)"
  >
    <template #info>
      <BookInfoPanel
        v-if="book"
        :title="book.title"
        :meta-parts="metaParts"
        :rows="rows"
      >
        <template #cover>
          <!-- 세로 표지든 가로로 긴 이미지든 같은 자리를 차지하도록 2:3 프레임에 레터박스로 넣는다 -->
          <div class="bg-muted aspect-2/3 w-full">
            <img
              :src="buildCoverUrl(book.cover_path, 0)"
              alt="표지"
              class="h-full w-full object-contain"
            />
          </div>
        </template>
        <template #extras>
          <LibraryBookExtras :book="book" />
        </template>
        <template v-if="readable" #actions>
          <Button @click="handleRead">
            <Icon icon="solar:book-bold-duotone" class="h-4 w-4" />
            읽기
          </Button>
        </template>
      </BookInfoPanel>
    </template>

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

    <template #large-image="{ url, index }">
      <img :src="url" :alt="`Page ${index + 1}`" />
    </template>
  </PreviewDialogShell>
</template>
