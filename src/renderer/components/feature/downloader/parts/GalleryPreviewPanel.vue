<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Button } from "@/components/ui/button";
import { useGalleryCard } from "@/composables/useGalleryCard";
import type { MetaField } from "@/lib/cardLayout";
import {
  buildDetailRows,
  buildMetaLine,
  type CardStatus,
} from "@/lib/galleryCard";
import { buildLanguageChips } from "@/lib/galleryNavigation";
import { Icon } from "@iconify/vue";
import type { Book, GalleryDto } from "@/../types/ipc";
import { computed } from "vue";
import BookInfoPanel from "../../parts/BookInfoPanel.vue";
import LibraryBookExtras from "../../parts/LibraryBookExtras.vue";
import GalleryRelatedList from "./GalleryRelatedList.vue";
import GalleryStatusBadge from "./GalleryStatusBadge.vue";

interface Props {
  gallery: GalleryDto;
  downloadStatus?: { status: string; progress?: number; error?: string };
  bookId?: number | null;
  /** 라이브러리에 있는 책. 있으면 별점·경로 같은 라이브러리 정보가 붙는다 */
  book?: Book | null;
  downloadPath?: string;
  relatedGalleries?: GalleryDto[];
  relatedLoading?: boolean;
  relatedFailed?: boolean;
  /** 연관 작품·언어판처럼 지금 갤러리가 아닌 id의 상태 */
  resolveStatus: (id: number) => CardStatus;
  resolveBookId: (id: number) => number | null;
}

const props = withDefaults(defineProps<Props>(), {
  downloadStatus: () => ({ status: "idle" }),
  bookId: null,
  book: null,
  downloadPath: "",
  relatedGalleries: () => [],
  relatedLoading: false,
  relatedFailed: false,
});

const emit = defineEmits<{
  /** 같은 창에서 뷰어로 넘어갈 때. 다이얼로그를 닫는 데 쓴다 */
  "open-book": [];
  navigate: [gallery: GalleryDto];
  "select-language": [galleryId: number];
}>();

const META_FIELDS: MetaField[] = ["pages", "date"];

const metaParts = computed(() => buildMetaLine(props.gallery, META_FIELDS));
const rows = computed(() => buildDetailRows(props.gallery));
const languageChips = computed(() =>
  buildLanguageChips(props.gallery.id, props.gallery.translations),
);

const {
  cardStatus,
  isDownloading,
  isDownloadCompleted,
  handleOpenBook,
  handleDownload,
} = useGalleryCard(props);

const handleRead = (event: MouseEvent) => {
  handleOpenBook(event);
  // Ctrl/Cmd 클릭은 새 창으로 열리므로 미리보기를 그대로 둔다
  if (!event.ctrlKey && !event.metaKey) emit("open-book");
};
</script>

<template>
  <BookInfoPanel
    :title="gallery.title.display"
    :meta-parts="metaParts"
    :rows="rows"
  >
    <template #cover>
      <ProxiedImage
        :id="gallery.id"
        :url="gallery.thumbnailUrl"
        :referer="`https://hitomi.la/reader/${gallery.id}.html`"
        alt="표지"
        class="aspect-2/3 w-full object-cover"
      />
      <div class="absolute top-2 left-2 flex">
        <GalleryStatusBadge :status="cardStatus" />
      </div>
    </template>

    <template v-if="languageChips.length > 0" #row-language>
      <template v-for="chip in languageChips" :key="chip.id">
        <span
          v-if="chip.current"
          class="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs"
          title="지금 보는 언어판"
        >
          {{ chip.label }}
          <span
            v-if="resolveBookId(chip.id) !== null"
            class="h-1.5 w-1.5 rounded-full bg-emerald-300"
          />
        </span>
        <button
          v-else
          type="button"
          class="hover:border-primary inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors"
          title="이 언어판으로 이동"
          @click="emit('select-language', chip.id)"
        >
          {{ chip.label }}
          <span
            v-if="resolveBookId(chip.id) !== null"
            class="h-1.5 w-1.5 rounded-full bg-emerald-500"
            title="라이브러리에 있음"
          />
        </button>
      </template>
    </template>

    <template v-if="book" #extras>
      <LibraryBookExtras :book="book" />
    </template>

    <template v-if="gallery.relatedIds.length > 0" #aside>
      <GalleryRelatedList
        :ids="gallery.relatedIds"
        :galleries="relatedGalleries"
        :loading="relatedLoading"
        :failed="relatedFailed"
        :resolve-status="resolveStatus"
        @select="emit('navigate', $event)"
      />
    </template>

    <template #actions>
      <Button
        v-if="isDownloadCompleted"
        :disabled="!bookId"
        @click="handleRead"
      >
        <Icon icon="solar:book-bold-duotone" class="h-4 w-4" />
        읽기
      </Button>
      <template v-else>
        <div
          v-if="cardStatus.kind === 'downloading'"
          class="bg-muted h-1.5 w-36 overflow-hidden rounded-full"
        >
          <div
            class="bg-primary h-full transition-[width] duration-300"
            :class="cardStatus.indeterminate ? 'w-full animate-pulse' : ''"
            :style="
              cardStatus.indeterminate
                ? undefined
                : { width: `${cardStatus.percent ?? 0}%` }
            "
          ></div>
        </div>
        <Button :disabled="isDownloading" @click="handleDownload">
          <Icon icon="solar:download-bold-duotone" class="h-4 w-4" />
          {{ cardStatus.buttonLabel }}
        </Button>
      </template>
    </template>
  </BookInfoPanel>
</template>
