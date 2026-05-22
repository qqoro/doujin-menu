<script setup lang="ts">
import { ipcRenderer } from "@/api";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Icon } from "@iconify/vue";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreviewViewMode } from "@/composables/usePreviewViewMode";
import { computed, nextTick, ref, watch } from "vue";

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

const { viewMode, setViewMode } = usePreviewViewMode();

const dialogOpen = computed({
  get: () => props.open,
  set: (value) => emit("update:open", value),
});

const displayTitle = computed(() => {
  return props.gallery?.title?.display || "N/A";
});

const displayArtists = computed(() => {
  return props.gallery?.artists?.join(", ") || "알 수 없음";
});

const displayTags = computed(() => {
  return props.gallery?.tags || [];
});

const refererUrl = computed(() => {
  return props.gallery?.id
    ? `https://hitomi.la/reader/${props.gallery.id}.html`
    : "";
});

const previewImageUrls = ref<string[]>([]);
const isLoadingImages = ref(false);
const imageLoadError = ref<string | null>(null);

// 가로 스크롤 핸들러 (속도 배율 적용)
const SCROLL_SPEED_MULTIPLIER = 3;
const handleWheelScroll = (event: WheelEvent) => {
  const container = event.currentTarget as HTMLElement;
  event.preventDefault();
  container.scrollLeft +=
    (event.deltaY + event.deltaX) * SCROLL_SPEED_MULTIPLIER;
};

// Intersection Observer 관련
const imageRefs = ref<HTMLElement[]>([]);
const loadedImages = ref<Set<number>>(new Set());
let observer: IntersectionObserver | null = null;

const getObserverRoot = () => {
  if (viewMode.value === "scroll") {
    return document.querySelector(".image-scroll-container");
  }
  return document.querySelector(".image-grid-container");
};

const initIntersectionObserver = () => {
  if (observer) {
    observer.disconnect();
  }
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = parseInt(
            entry.target.getAttribute("data-index") || "-1",
          );
          if (index !== -1 && !loadedImages.value.has(index)) {
            loadedImages.value.add(index);
          }
        }
      });
    },
    {
      root: getObserverRoot(),
      rootMargin: "0px",
      threshold: 0.1,
    },
  );

  nextTick(() => {
    imageRefs.value.forEach((imgRef) => {
      if (imgRef) {
        observer?.observe(imgRef);
      }
    });
  });
};

watch(
  () => props.open,
  async (newVal) => {
    if (newVal && props.gallery) {
      isLoadingImages.value = true;
      imageLoadError.value = null;
      previewImageUrls.value = [];
      loadedImages.value.clear();

      try {
        const result = await ipcRenderer.invoke(
          "get-gallery-image-urls",
          props.gallery.id,
        );
        if (result.success && result.data) {
          previewImageUrls.value = result.data;
          nextTick(() => {
            initIntersectionObserver();
          });
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
    } else if (!newVal) {
      // 다이얼로그 닫힐 때 observer 해제
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
  },
  { immediate: true },
);

// 뷰 모드 전환 시 Observer 재초기화
watch(viewMode, () => {
  if (props.open && previewImageUrls.value.length > 0) {
    nextTick(() => {
      initIntersectionObserver();
    });
  }
});
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent
      class="flex h-[90vh] flex-col sm:max-w-[90vw]"
      @close-auto-focus.prevent
    >
      <DialogHeader>
        <DialogTitle>미리보기: {{ displayTitle }}</DialogTitle>
      </DialogHeader>
      <div v-if="gallery" class="flex flex-1 flex-col overflow-hidden">
        <div class="mb-4 flex-shrink-0 space-y-2">
          <p class="text-muted-foreground text-sm">
            작가: {{ displayArtists }}
          </p>
          <div class="flex flex-wrap gap-1">
            <Badge
              v-for="tag in displayTags"
              :key="tag.name"
              variant="secondary"
            >
              {{ tag.name }}
            </Badge>
          </div>
        </div>

        <div class="mb-2 flex items-center justify-end">
          <ToggleGroup
            type="single"
            :model-value="viewMode"
            @update:model-value="setViewMode"
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="scroll">
              <Icon icon="solar:gallery-wide-bold-duotone" class="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid">
              <Icon icon="solar:widget-5-bold-duotone" class="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div
            v-if="isLoadingImages"
            class="flex h-full items-center justify-center"
          >
            <p class="text-muted-foreground">미리보기 이미지 불러오는 중...</p>
          </div>
          <div
            v-else-if="imageLoadError"
            class="text-destructive flex h-full items-center justify-center"
          >
            <p>{{ imageLoadError }}</p>
          </div>
          <!-- 가로 스크롤 뷰 -->
          <div
            v-else-if="previewImageUrls.length > 0 && viewMode === 'scroll'"
            class="image-scroll-container flex h-full space-x-4 overflow-x-auto rounded-md border p-2"
            @wheel="handleWheelScroll"
          >
            <div
              v-for="(url, index) in previewImageUrls"
              :key="index"
              ref="imageRefs"
              :data-index="index"
              class="flex h-full flex-shrink-0 cursor-zoom-out items-center justify-center"
              @click="dialogOpen = false"
            >
              <ProxiedImage
                :id="gallery.id"
                :url="url"
                :referer="refererUrl"
                :alt="`Preview Image ${index + 1}`"
                :lazy="!loadedImages.has(index)"
                class="max-h-full w-auto object-contain"
              />
            </div>
          </div>
          <!-- 그리드 뷰 -->
          <div
            v-else-if="previewImageUrls.length > 0 && viewMode === 'grid'"
            class="image-grid-container grid grid-cols-5 gap-2 rounded-md border p-2"
          >
            <div
              v-for="(url, index) in previewImageUrls"
              :key="'grid-' + index"
              ref="imageRefs"
              :data-index="index"
              class="cursor-pointer overflow-hidden rounded"
              @click="setViewMode('scroll')"
            >
              <ProxiedImage
                v-if="loadedImages.has(index)"
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
            </div>
          </div>
          <div
            v-else
            class="text-muted-foreground flex h-full items-center justify-center"
          >
            <p>미리보기 이미지가 없습니다.</p>
          </div>
        </div>
      </div>
      <div v-else class="text-muted-foreground text-center">
        선택된 갤러리가 없습니다.
      </div>
    </DialogContent>
  </Dialog>
</template>
