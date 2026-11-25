<script setup lang="ts">
import { toMediaUrl } from "@/lib/mediaUrl";
import { getBook, ipcRenderer } from "@/api";
import PreviewDialogShell from "@/components/common/PreviewDialogShell.vue";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Button } from "@/components/ui/button";
import { resolveCardStatus } from "@/lib/galleryCard";
import {
  popHistory,
  pushHistory,
  truncateHistory,
} from "@/lib/galleryNavigation";
import type { Book, GalleryDto } from "@/../types/ipc";
import { Icon } from "@iconify/vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import GalleryPreviewPanel from "./parts/GalleryPreviewPanel.vue";

type DownloadStatus = { status: string; progress?: number; error?: string };

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 다운로더 목록에서 연 갤러리. 이동 기록의 시작점이다 */
    gallery?: GalleryDto | null;
    downloadStatuses: Record<number, DownloadStatus>;
    /** 라이브러리 보유 여부. 다운로더가 화면 단위로 한 번에 조회한 값을 받는다 */
    resolveBookId: (galleryId: number) => number | null;
    downloadPath?: string;
  }>(),
  {
    gallery: null,
    downloadPath: "",
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  /** 보유 여부가 필요한 id. 다운로더가 목록 id와 합쳐 한 번에 조회한다 */
  "visible-ids": [ids: number[]];
}>();

const IDLE: DownloadStatus = { status: "idle" };
const DETAIL_STALE_TIME = 5 * 60 * 1000;

/** 상세보기 안에서 옮겨 다닌 갤러리. 마지막이 지금 보는 갤러리다 */
const history = ref<GalleryDto[]>([]);

// 닫을 때는 비우지 않는다. 비우면 닫히는 애니메이션 동안 처음 갤러리로 되돌아간다
watch(
  () => [props.open, props.gallery?.id] as const,
  () => {
    if (props.open && props.gallery) history.value = [props.gallery];
  },
  { immediate: true },
);

const current = computed(() => history.value.at(-1) ?? props.gallery ?? null);
const galleryId = computed(() => current.value?.id ?? 0);
const currentBookId = computed(() =>
  current.value ? props.resolveBookId(current.value.id) : null,
);
const currentStatus = computed(
  () => props.downloadStatuses[galleryId.value] ?? IDLE,
);

const resolveStatus = (id: number) =>
  resolveCardStatus({
    bookId: props.resolveBookId(id),
    status: props.downloadStatuses[id]?.status ?? "idle",
    progress: props.downloadStatuses[id]?.progress,
  });

const visibleIds = computed(() => {
  const gallery = current.value;
  if (!props.open || !gallery) return [];
  return [
    ...new Set([
      gallery.id,
      ...gallery.relatedIds,
      ...gallery.translations.map((translation) => translation.id),
    ]),
  ];
});

watch(visibleIds, (ids) => emit("visible-ids", ids), { immediate: true });

const queryClient = useQueryClient();

const fetchGalleryDetails = (id: number) =>
  queryClient.fetchQuery({
    queryKey: ["gallery-details", id],
    queryFn: async () => {
      const result = await ipcRenderer.invoke("get-gallery-details", id);
      if (!result.success || !result.data) {
        throw new Error(result.error || "갤러리 정보를 가져오지 못했습니다.");
      }
      return result.data;
    },
    staleTime: DETAIL_STALE_TIME,
  });

/** 지워진 갤러리처럼 일부가 실패해도 나머지는 보여준다. 전부 실패하면 오류로 본다 */
const relatedQuery = useQuery({
  queryKey: computed(() => ["gallery-related", galleryId.value]),
  queryFn: async () => {
    const ids = current.value?.relatedIds ?? [];
    const results = await Promise.allSettled(ids.map(fetchGalleryDetails));
    const galleries = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (ids.length > 0 && galleries.length === 0) {
      throw new Error("연관 작품을 불러오지 못했습니다.");
    }
    return galleries;
  },
  enabled: computed(
    () => props.open && (current.value?.relatedIds.length ?? 0) > 0,
  ),
  staleTime: DETAIL_STALE_TIME,
  retry: false,
});

const navigate = (gallery: GalleryDto) => {
  history.value = pushHistory(history.value, gallery);
};

/** 응답을 기다리는 사이 다른 곳으로 옮겼거나 닫았으면 그 응답은 버린다 */
const selectLanguage = async (id: number) => {
  const snapshot = history.value;
  try {
    const gallery = await fetchGalleryDetails(id);
    if (!props.open || history.value !== snapshot) return;
    navigate(gallery);
  } catch (error) {
    if (!props.open || history.value !== snapshot) return;
    toast.error("언어판을 불러오지 못했습니다.", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};

const goBack = () => {
  history.value = popHistory(history.value);
};

const jumpTo = (index: number) => {
  history.value = truncateHistory(history.value, index);
};

/** 이동 기록이 있으면 Esc는 닫지 않고 한 단계 돌아간다 */
const handleEscape = (event: KeyboardEvent) => {
  if (history.value.length <= 1) return;
  event.preventDefault();
  goBack();
};

const refererUrl = computed(() =>
  galleryId.value ? `https://hitomi.la/reader/${galleryId.value}.html` : "",
);

/** 라이브러리에 있는 책. 정보 패널의 라이브러리 정보에 쓴다 */
const ownedBook = ref<Book | null>(null);
const previewImageUrls = ref<string[]>([]);
/** 라이브러리 파일을 읽는지(local), hitomi에서 받는지(remote) */
const previewSource = ref<"local" | "remote">("remote");
const isLoadingImages = ref(false);
const imageLoadError = ref<string | null>(null);

/**
 * 요청 번호. 갤러리를 빠르게 바꾸면 앞 갤러리의 응답이 뒤늦게 도착해 지금
 * 갤러리의 미리보기를 덮어쓰므로, 번호가 바뀐 응답은 버린다.
 */
let previewRequest = 0;

const loadPreview = async () => {
  const gallery = current.value;
  if (!props.open || !gallery) return;

  const request = ++previewRequest;
  const isStale = () => request !== previewRequest;

  isLoadingImages.value = true;
  imageLoadError.value = null;
  previewImageUrls.value = [];

  try {
    const bookId = currentBookId.value;
    const book =
      bookId !== null ? await getBook(bookId).catch(() => null) : null;
    if (isStale()) return;
    ownedBook.value = book;

    // 드라이브가 빠진 책은 로컬 파일을 못 읽으니 hitomi에서 받는다
    if (book && !book.is_offline && (book.page_count ?? 0) > 0) {
      previewSource.value = "local";
      previewImageUrls.value = Array.from(
        { length: book.page_count ?? 0 },
        (_, index) => toMediaUrl(`doujin-menu://${book.id}/${index}`),
      );
      return;
    }

    previewSource.value = "remote";
    const result = await ipcRenderer.invoke(
      "get-gallery-image-urls",
      gallery.id,
    );
    if (isStale()) return;
    if (result.success && result.data) {
      previewImageUrls.value = result.data;
    } else {
      imageLoadError.value =
        result.error || "미리보기 URL을 가져오지 못했습니다.";
    }
  } catch (error) {
    if (isStale()) return;
    const message = error instanceof Error ? error.message : String(error);
    imageLoadError.value = `미리보기 로드 중 오류 발생: ${message}`;
  } finally {
    if (!isStale()) isLoadingImages.value = false;
  }
};

// 열려 있는 동안 다운로드가 끝나 보유 상태가 바뀌어도 로컬 미리보기로 갈아탄다
watch(
  () => [props.open, galleryId.value, currentBookId.value] as const,
  loadPreview,
  { immediate: true },
);
</script>

<template>
  <PreviewDialogShell
    :open="open"
    :title="current?.title.display"
    :urls="previewImageUrls"
    :is-loading="isLoadingImages"
    :error="imageLoadError"
    :has-target="!!current"
    empty-message="선택된 갤러리가 없습니다."
    :scroll-speed="3"
    @update:open="emit('update:open', $event)"
    @escape="handleEscape"
  >
    <template #info>
      <!-- 오른쪽 위 닫기 버튼과 겹치지 않게 오른쪽을 비워 둔다 -->
      <div
        v-if="history.length > 1"
        class="text-muted-foreground mb-3 flex items-center gap-2 pr-8 text-xs"
      >
        <Button variant="outline" size="sm" class="h-7 gap-1.5" @click="goBack">
          <Icon icon="solar:arrow-left-linear" class="h-3.5 w-3.5" />
          뒤로
          <kbd class="rounded border px-1 text-[10px] leading-4">Esc</kbd>
        </Button>
        <nav
          class="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap"
          aria-label="이동 경로"
        >
          <template v-for="(item, index) in history" :key="index">
            <span
              v-if="index === history.length - 1"
              class="text-foreground truncate"
            >
              {{ item.title.display }}
            </span>
            <template v-else>
              <button
                type="button"
                class="hover:text-foreground max-w-56 truncate hover:underline"
                @click="jumpTo(index)"
              >
                {{ item.title.display }}
              </button>
              <Icon
                icon="solar:alt-arrow-right-linear"
                class="h-3 w-3 shrink-0"
              />
            </template>
          </template>
        </nav>
      </div>

      <GalleryPreviewPanel
        v-if="current"
        :gallery="current"
        :download-status="currentStatus"
        :book-id="currentBookId"
        :book="ownedBook"
        :download-path="downloadPath"
        :related-galleries="relatedQuery.data.value ?? []"
        :related-loading="relatedQuery.isPending.value"
        :related-failed="relatedQuery.isError.value"
        :resolve-status="resolveStatus"
        :resolve-book-id="resolveBookId"
        @open-book="emit('update:open', false)"
        @navigate="navigate"
        @select-language="selectLanguage"
      />
    </template>

    <template #scroll-image="{ url, index, loaded }">
      <template v-if="previewSource === 'local'">
        <img
          v-if="loaded"
          :src="url"
          :alt="`Preview Image ${index + 1}`"
          class="max-h-full w-auto object-contain"
          loading="lazy"
        />
        <div
          v-else
          class="bg-muted flex h-full w-64 items-center justify-center"
        >
          <p class="text-muted-foreground text-sm">로딩 중...</p>
        </div>
      </template>
      <!-- ProxiedImage가 자체 스켈레톤을 그리므로 로딩 전 자리는 lazy에 맡긴다 -->
      <ProxiedImage
        v-else
        :id="galleryId"
        :url="url"
        :referer="refererUrl"
        :alt="`Preview Image ${index + 1}`"
        :lazy="!loaded"
        class="max-h-full w-auto min-w-40 object-contain"
      />
    </template>

    <template #grid-image="{ url, index, loaded }">
      <template v-if="loaded">
        <img
          v-if="previewSource === 'local'"
          :src="url"
          :alt="`Preview Image ${index + 1}`"
          class="aspect-[3/4] w-full object-cover transition-transform duration-200 hover:scale-105"
          loading="lazy"
        />
        <ProxiedImage
          v-else
          :id="galleryId"
          :url="url"
          :referer="refererUrl"
          :alt="`Preview Image ${index + 1}`"
          :lazy="false"
          class="aspect-[3/4] w-full object-cover transition-transform duration-200 hover:scale-105"
        />
      </template>
      <div
        v-else
        class="bg-muted flex aspect-[3/4] w-full items-center justify-center"
      >
        <p class="text-muted-foreground text-sm">로딩 중...</p>
      </div>
    </template>

    <template #large-image="{ url, index }">
      <img
        v-if="previewSource === 'local'"
        :src="url"
        :alt="`Page ${index + 1}`"
      />
      <!-- 래퍼가 꽉 찬 크기를 잡으므로 이미지 비율은 contain으로 지킨다 -->
      <ProxiedImage
        v-else
        :id="galleryId"
        :url="url"
        :referer="refererUrl"
        :alt="`Page ${index + 1}`"
        class="[&_img]:object-contain"
      />
    </template>
  </PreviewDialogShell>
</template>
