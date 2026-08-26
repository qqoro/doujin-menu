<script setup lang="ts">
import { ipcRenderer } from "@/api";
import PreviewDialogShell from "@/components/common/PreviewDialogShell.vue";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { computed, ref, watch } from "vue";

const props = defineProps({
  open: {
    type: Boolean,
    required: true,
  },
  gallery: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update:open"]);

const artists = computed<string[]>(() => props.gallery?.artists ?? []);

const tags = computed<{ name: string }[]>(() => props.gallery?.tags ?? []);

const refererUrl = computed(() =>
  props.gallery?.id ? `https://hitomi.la/reader/${props.gallery.id}.html` : "",
);

const previewImageUrls = ref<string[]>([]);
const isLoadingImages = ref(false);
const imageLoadError = ref<string | null>(null);

watch(
  () => props.open,
  async (newVal) => {
    if (!newVal || !props.gallery) return;

    isLoadingImages.value = true;
    imageLoadError.value = null;
    previewImageUrls.value = [];

    try {
      const result = await ipcRenderer.invoke(
        "get-gallery-image-urls",
        props.gallery.id,
      );
      if (result.success && result.data) {
        previewImageUrls.value = result.data;
      } else {
        imageLoadError.value =
          result.error || "미리보기 URL을 가져오지 못했습니다.";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      imageLoadError.value = `미리보기 로드 중 오류 발생: ${message}`;
    } finally {
      isLoadingImages.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <PreviewDialogShell
    :open="open"
    :title="gallery?.title?.display || 'N/A'"
    :artists="artists"
    :tags="tags"
    :urls="previewImageUrls"
    :is-loading="isLoadingImages"
    :error="imageLoadError"
    :has-target="!!gallery"
    empty-message="선택된 갤러리가 없습니다."
    :scroll-speed="3"
    @update:open="emit('update:open', $event)"
  >
    <!-- ProxiedImage가 자체 스켈레톤을 그리므로 로딩 전 자리는 lazy에 맡긴다 -->
    <template #scroll-image="{ url, index, loaded }">
      <ProxiedImage
        :id="gallery.id"
        :url="url"
        :referer="refererUrl"
        :alt="`Preview Image ${index + 1}`"
        :lazy="!loaded"
        class="max-h-full w-auto min-w-40 object-contain"
      />
    </template>

    <template #grid-image="{ url, index, loaded }">
      <ProxiedImage
        v-if="loaded"
        :id="gallery.id"
        :url="url"
        :referer="refererUrl"
        :alt="`Preview Image ${index + 1}`"
        :lazy="false"
        class="aspect-[3/4] w-full object-cover transition-transform duration-200 hover:scale-105"
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
