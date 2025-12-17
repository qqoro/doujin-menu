<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { computed, nextTick, ref, watch } from "vue";
import type { Book } from "../../../types/ipc";

const props = defineProps<{
  open: boolean;
  book: Book | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const dialogOpen = computed({
  get: () => props.open,
  set: (value) => emit("update:open", value),
});

const displayTitle = computed(() => {
  return props.book?.title || "N/A";
});

const displayArtists = computed(() => {
  return props.book?.artists?.map((a) => a.name).join(", ") || "알 수 없음";
});

const displayTags = computed(() => {
  return props.book?.tags || [];
});

const previewImageUrls = ref<string[]>([]);
const isLoadingImages = ref(false);
const imageLoadError = ref<string | null>(null);

// 가로 스크롤 핸들러
const handleWheelScroll = (event: WheelEvent) => {
  const container = event.currentTarget as HTMLElement;
  event.preventDefault();
  container.scrollLeft += event.deltaY + event.deltaX;
};

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
          }
        }
      });
    },
    {
      root: document.querySelector(".image-scroll-container"),
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
    if (newVal && props.book) {
      isLoadingImages.value = true;
      imageLoadError.value = null;
      previewImageUrls.value = [];
      loadedImages.value.clear();

      try {
        // 책의 모든 페이지 이미지 URL 생성
        const pageCount = props.book.page_count || 0;
        const urls: string[] = [];
        for (let i = 0; i < pageCount; i++) {
          urls.push(`doujin-menu://${props.book.id}/${i}`);
        }
        previewImageUrls.value = urls;
        nextTick(() => {
          initIntersectionObserver();
        });
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
      <div v-if="book" class="flex flex-1 flex-col overflow-hidden">
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

        <div class="flex-1 overflow-hidden">
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
          <div
            v-else-if="previewImageUrls.length > 0"
            class="image-scroll-container flex h-full space-x-4 overflow-x-auto rounded-md border p-2"
            @wheel="handleWheelScroll"
          >
            <div
              v-for="(url, index) in previewImageUrls"
              :key="index"
              ref="imageRefs"
              :data-index="index"
              class="flex h-full flex-shrink-0 items-center justify-center"
            >
              <img
                v-if="loadedImages.has(index)"
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
        선택된 책이 없습니다.
      </div>
    </DialogContent>
  </Dialog>
</template>
