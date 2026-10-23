<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import TagBadge from "@/components/common/TagBadge.vue";
import { Button } from "@/components/ui/button";
import { useGalleryCard } from "@/composables/useGalleryCard";
import type { MetaField } from "@/lib/cardLayout";
import {
  buildDetailRows,
  buildMetaLine,
  type DetailRowKey,
} from "@/lib/galleryCard";
import { Icon } from "@iconify/vue";
import type { GalleryDto } from "@/../types/ipc";
import { computed } from "vue";
import MetaLine from "../../parts/MetaLine.vue";
import GalleryStatusBadge from "./GalleryStatusBadge.vue";

interface Props {
  gallery: GalleryDto;
  downloadStatus?: { status: string; progress?: number; error?: string };
  bookId?: number | null;
  downloadPath?: string;
}

const props = withDefaults(defineProps<Props>(), {
  downloadStatus: () => ({ status: "idle" }),
  bookId: null,
  downloadPath: "",
});

const emit = defineEmits<{
  /** 같은 창에서 뷰어로 넘어갈 때. 다이얼로그를 닫는 데 쓴다 */
  "open-book": [];
}>();

const META_FIELDS: MetaField[] = ["pages", "date"];

const ROW_META: Record<DetailRowKey, { label: string; icon: string }> = {
  id: { label: "Hitomi ID", icon: "solar:hashtag-linear" },
  artist: { label: "작가", icon: "solar:pen-new-round-linear" },
  series: { label: "시리즈", icon: "solar:bookmark-linear" },
  type: { label: "유형", icon: "solar:notebook-linear" },
  language: { label: "언어", icon: "solar:global-linear" },
  group: { label: "그룹", icon: "solar:users-group-rounded-linear" },
  tag: { label: "태그", icon: "solar:tag-linear" },
  character: { label: "캐릭터", icon: "solar:user-linear" },
};

const metaParts = computed(() => buildMetaLine(props.gallery, META_FIELDS));
const rows = computed(() => buildDetailRows(props.gallery));

const {
  cardStatus,
  isDownloading,
  isDownloadCompleted,
  handleOpenBook,
  handleDownload,
  copyToClipboard,
} = useGalleryCard(props);

const handleRead = (event: MouseEvent) => {
  handleOpenBook(event);
  // Ctrl/Cmd 클릭은 새 창으로 열리므로 미리보기를 그대로 둔다
  if (!event.ctrlKey && !event.metaKey) emit("open-book");
};
</script>

<template>
  <!-- 태그가 많은 갤러리에서 미리보기 자리를 다 먹지 않도록 높이를 묶고 정보 줄만 스크롤한다 -->
  <div class="mb-4 flex max-h-[40vh] shrink-0 gap-5">
    <div class="relative w-44 shrink-0 self-start overflow-hidden rounded-lg">
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
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <h2 class="text-lg leading-snug font-bold break-all">
        {{ gallery.title.display }}
      </h2>
      <MetaLine class="text-muted-foreground mt-1" :parts="metaParts" />

      <div class="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        <p class="text-muted-foreground mb-1.5 text-xs">
          클릭하면 검색어로, 우클릭하면 제외 검색어로 복사합니다.
        </p>
        <dl class="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <template v-for="row in rows" :key="row.key">
            <dt class="text-muted-foreground flex items-center gap-1.5">
              <Icon
                :icon="ROW_META[row.key].icon"
                class="h-3.5 w-3.5 shrink-0"
              />
              {{ ROW_META[row.key].label }}
            </dt>
            <dd class="flex min-w-0 flex-wrap gap-1">
              <!-- 태그 외 줄은 종류 접두어가 이름에 찍히지 않도록 객체로 넘긴다 -->
              <TagBadge
                v-for="item in row.items"
                :key="item.term"
                :tag="
                  row.key === 'tag'
                    ? item.term
                    : { type: row.key, name: item.text }
                "
                @click="copyToClipboard(item.term)"
                @contextmenu.prevent="
                  row.key !== 'id' && copyToClipboard(`-${item.term}`)
                "
              />
            </dd>
          </template>
        </dl>
      </div>

      <div class="mt-3 flex shrink-0 items-center justify-end gap-3">
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
      </div>
    </div>
  </div>
</template>
