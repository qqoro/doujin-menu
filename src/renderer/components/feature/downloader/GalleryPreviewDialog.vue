<script setup lang="ts">
import { ipcRenderer } from "@/api";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// Intersection Observer 관련
const imageRefs = ref<HTMLElement[]>([]);
const loadedImages = ref<Set<number>>(new Set());
let observer: IntersectionObserver | null = null;

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
            // 이미지 로드 시작 (ProxiedImage의 lazy prop을 false로 변경)
            // 여기서는 직접적으로 ProxiedImage의 lazy prop을 변경할 수 없으므로,
            // v-if를 사용하여 컴포넌트를 다시 렌더링하거나, ProxiedImage 내부에서 IntersectionObserver를 처리해야 합니다.
            // 현재 구조에서는 ProxiedImage에 lazy prop을 추가하고, 여기서는 해당 이미지가 로드되었음을 표시하는 방식으로 진행합니다.
          }
        }
      });
    },
    {
      root: document.querySelector(".image-scroll-container"), // 스크롤 컨테이너 지정
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
      previewImageUrls.value = []; // 다이얼로그 열릴 때마다 이미지 URL 초기화
      loadedImages.value.clear(); // 로드된 이미지 상태 초기화

      try {
        const result = await ipcRenderer.invoke(
          "get-gallery-image-urls", // 변경된 IPC 이벤트 이름
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

// 컴포넌트 언마운트 시 observer 해제
// onUnmounted(() => {
//   if (observer) {
//     observer.disconnect();
//   }
// });
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent
      class="sm:max-w-[90vw] h-[90vh] flex flex-col"
      @close-auto-focus.prevent
    >
      <DialogHeader>
        <DialogTitle>미리보기: {{ displayTitle }}</DialogTitle>
      </DialogHeader>
      <div v-if="gallery" class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-shrink-0 space-y-2 mb-4">
          <p class="text-sm text-muted-foreground">
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

        <div class="flex-1 overflow-hidden">
          <div
            v-if="isLoadingImages"
            class="flex items-center justify-center h-full"
          >
            <p class="text-muted-foreground">미리보기 이미지 불러오는 중...</p>
          </div>
          <div
            v-else-if="imageLoadError"
            class="flex items-center justify-center h-full text-destructive"
          >
            <p>{{ imageLoadError }}</p>
          </div>
          <div
            v-else-if="previewImageUrls.length > 0"
            class="flex overflow-x-auto h-full space-x-4 p-2 border rounded-md image-scroll-container"
          >
            <div
              v-for="(url, index) in previewImageUrls"
              :key="index"
              ref="imageRefs"
              :data-index="index"
              class="flex-shrink-0 h-full flex items-center justify-center"
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
          <div
            v-else
            class="flex items-center justify-center h-full text-muted-foreground"
          >
            <p>미리보기 이미지가 없습니다.</p>
          </div>
        </div>
      </div>
      <div v-else class="text-center text-muted-foreground">
        선택된 갤러리가 없습니다.
      </div>
    </DialogContent>
  </Dialog>
</template>
