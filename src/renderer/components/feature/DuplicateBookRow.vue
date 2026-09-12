<script setup lang="ts">
import * as api from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildBookMenuItems,
  buildCoverUrl,
  filterValidNames,
} from "@/lib/bookCard";
import type { GroupHighlight } from "@/lib/duplicateCompare";
import { formatBytes } from "@/lib/duplicateCompare";
import { formatPublishDate } from "@/lib/formatDate";
import { Icon } from "@iconify/vue";
import { computed } from "vue";
import { toast } from "vue-sonner";
import type { DuplicateBookInfo } from "../../../types/ipc";
import BookCardMenu from "./parts/BookCardMenu.vue";
import CreditsLine from "./parts/CreditsLine.vue";
import RowCardShell from "./parts/RowCardShell.vue";

const props = defineProps<{
  book: DuplicateBookInfo;
  /** 삭제 대상으로 지정됨 */
  selected: boolean;
  highlight: GroupHighlight;
}>();

const emit = defineEmits<{
  toggle: [];
  preview: [];
  details: [];
}>();

const isOffline = computed(() => !!props.book.is_offline);

const coverUrl = computed(() => buildCoverUrl(props.book.cover_path, 0));

const credits = computed(() => ({
  artists: filterValidNames(props.book.artists).map((artist) => artist.name),
}));

const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text);
  toast.success(`${text}가 클립보드에 복사되었습니다.`, { duration: 750 });
};

const showOfflineToast = () => {
  toast.warning("라이브러리 폴더에 접근할 수 없습니다.", {
    description: "해당 폴더에 접근할 수 있는지 확인한 후 다시 스캔해 주세요.",
  });
};

const openInNewWindow = () => {
  if (isOffline.value) {
    showOfflineToast();
    return;
  }
  api.openNewWindow(`/viewer/${props.book.id}`);
};

const openFolder = async () => {
  try {
    await api.openBookFolder(props.book.path);
    toast.success("폴더가 열렸습니다.");
  } catch (error) {
    console.error(`Failed to open folder for book ${props.book.id}:`, error);
    toast.error("폴더 열기에 실패했습니다.");
  }
};

/** 이 화면이 쓰는 메뉴 항목만. 정의는 라이브러리와 같은 곳에서 낸다 */
const menuItems = computed(() =>
  buildBookMenuItems(
    { isFavorite: false, hasExternalViewer: false, isRescanning: false },
    {
      folder: openFolder,
      newWindow: openInNewWindow,
      details: () => emit("details"),
      preview: () => emit("preview"),
    },
  ),
);

/**
 * 메타 조각. `MetaLine` 대신 직접 그린다 — 그룹에서 더 나은 값만 강조해야 하는데
 * `MetaLine`은 모든 조각을 같은 모양으로 그린다.
 */
const metaParts = computed(() => {
  const parts: { key: string; text: string; best: boolean }[] = [];
  const { book, highlight } = props;

  if (book.page_count != null) {
    parts.push({
      key: "pages",
      text: `${book.page_count}페이지`,
      best: highlight.bestPageCount === book.page_count,
    });
  }

  parts.push({
    key: "size",
    text: book.file_size != null ? formatBytes(book.file_size) : "용량 미상",
    best:
      highlight.bestFileSize != null &&
      highlight.bestFileSize === book.file_size,
  });

  parts.push({
    key: "type",
    text: book.isArchive ? "압축파일" : "폴더",
    best: false,
  });

  const mtime = formatPublishDate(book.file_mtime);
  if (mtime) parts.push({ key: "mtime", text: mtime, best: false });

  if (book.hitomi_id)
    parts.push({ key: "id", text: `#${book.hitomi_id}`, best: false });

  return parts;
});

/** 읽던 중이면 진행률. 다 읽었거나 안 읽었으면 배지를 안 단다 */
const readingProgress = computed(() => {
  const { current_page: current, page_count: total } = props.book;
  if (!current || !total || current <= 1 || current >= total) return null;
  return Math.round((current / total) * 100);
});
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <RowCardShell
        :cover-url="coverUrl"
        :alt="book.title"
        :is-offline="isOffline"
        :is-favorite="!!book.is_favorite"
        :dimmed="selected"
        zoomable
        :class="
          selected
            ? 'border-destructive/60 inset-ring-destructive inset-ring-2'
            : ''
        "
        @click="!isOffline && emit('toggle')"
        @thumbnail-click="emit('preview')"
      >
        <template #content>
          <h3 class="text-[0.9375em] leading-snug font-bold">
            {{ book.title }}
          </h3>

          <CreditsLine
            v-if="credits.artists.length > 0"
            class="text-muted-foreground text-[0.78125em]"
            :credits="credits"
            :fields="['artist']"
          />

          <p
            class="text-muted-foreground flex items-center gap-1.5 overflow-hidden text-xs tabular-nums"
          >
            <template v-for="(part, index) in metaParts" :key="part.key">
              <span v-if="index > 0" class="opacity-40">·</span>
              <!-- 아이디는 다운로더처럼 클릭 시 검색어 복사, 우클릭 시 갤러리 URL 복사 -->
              <button
                v-if="part.key === 'id'"
                class="m-0 cursor-pointer border-none bg-transparent p-0 font-bold text-current hover:underline"
                @click.stop="copyToClipboard(`id:${book.hitomi_id}`)"
                @contextmenu.prevent.stop="
                  copyToClipboard(
                    `https://hitomi.la/galleries/${book.hitomi_id}.html`,
                  )
                "
              >
                {{ part.text }}
              </button>
              <span
                v-else
                class="truncate"
                :class="part.best ? 'text-foreground font-semibold' : ''"
              >
                {{ part.text }}
              </span>
            </template>
          </p>

          <p class="text-muted-foreground truncate text-xs" :title="book.path">
            {{ book.path }}
          </p>

          <div v-if="readingProgress !== null" class="flex">
            <Badge variant="secondary" class="gap-1">
              <Icon icon="solar:bookmark-bold-duotone" class="h-3 w-3" />
              읽던 중 {{ readingProgress }}%
            </Badge>
          </div>
        </template>

        <template #actions>
          <div class="flex w-[5.75em] shrink-0 flex-col gap-1.5">
            <Button size="sm" variant="outline" @click.stop="emit('preview')">
              <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
              미리보기
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <!-- 오프라인은 핸들러가 삭제를 거부하므로 지정 자체를 막는다 -->
                  <span class="inline-flex">
                    <Button
                      size="sm"
                      class="w-full"
                      :variant="selected ? 'destructive' : 'outline'"
                      :disabled="isOffline"
                      @click.stop="emit('toggle')"
                    >
                      <Icon
                        :icon="
                          selected
                            ? 'solar:trash-bin-trash-bold-duotone'
                            : 'solar:trash-bin-minimalistic-linear'
                        "
                        class="h-4 w-4"
                      />
                      {{ selected ? "삭제 예정" : "삭제 선택" }}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent v-if="isOffline">
                  오프라인 상태의 책은 삭제할 수 없습니다
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </template>

        <!-- 삭제 예정 카드를 붉게 덮어 남길 카드와 한눈에 갈린다 -->
        <template #overlay>
          <div
            v-if="selected"
            class="bg-destructive/10 pointer-events-none absolute inset-0 rounded-lg"
          />
        </template>
      </RowCardShell>
    </ContextMenuTrigger>

    <BookCardMenu :items="menuItems" />
  </ContextMenu>
</template>
