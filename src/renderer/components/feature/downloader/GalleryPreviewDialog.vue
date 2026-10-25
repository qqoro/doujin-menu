<script setup lang="ts">
import { toMediaUrl } from "@/lib/mediaUrl";
import { getBook, ipcRenderer } from "@/api";
import PreviewDialogShell from "@/components/common/PreviewDialogShell.vue";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import type { Book, GalleryDto } from "@/../types/ipc";
import { computed, ref, watch } from "vue";
import GalleryPreviewPanel from "./parts/GalleryPreviewPanel.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    gallery?: GalleryDto | null;
    downloadStatus?: { status: string; progress?: number; error?: string };
    /** 라이브러리 보유 여부. 다운로더가 화면 단위로 한 번에 조회한 값을 받는다 */
    bookId?: number | null;
    downloadPath?: string;
  }>(),
  {
    gallery: null,
    downloadStatus: () => ({ status: "idle" }),
    bookId: null,
    downloadPath: "",
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const galleryId = computed(() => props.gallery?.id ?? 0);

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
  const gallery = props.gallery;
  if (!props.open || !gallery) return;

  const request = ++previewRequest;
  const isStale = () => request !== previewRequest;

  isLoadingImages.value = true;
  imageLoadError.value = null;
  previewImageUrls.value = [];

  try {
    const book =
      props.bookId !== null
        ? await getBook(props.bookId).catch(() => null)
        : null;
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
watch(() => [props.open, galleryId.value, props.bookId] as const, loadPreview, {
  immediate: true,
});
</script>

<template>
  <PreviewDialogShell
    :open="open"
    :title="gallery?.title.display"
    :urls="previewImageUrls"
    :is-loading="isLoadingImages"
    :error="imageLoadError"
    :has-target="!!gallery"
    empty-message="선택된 갤러리가 없습니다."
    :scroll-speed="3"
    @update:open="emit('update:open', $event)"
  >
    <template #info>
      <GalleryPreviewPanel
        v-if="gallery"
        :gallery="gallery"
        :download-status="downloadStatus"
        :book-id="bookId"
        :book="ownedBook"
        :download-path="downloadPath"
        @open-book="emit('update:open', false)"
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
