<script setup lang="ts">
import PageLightbox from "@/components/common/PageLightbox.vue";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreviewViewMode } from "@/composables/usePreviewViewMode";
import { Icon } from "@iconify/vue";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

/**
 * 미리보기 다이얼로그의 공통 골격.
 *
 * 라이브러리 책과 다운로더 갤러리는 이미지 출처(로컬 프로토콜 / 프록시 다운로드)만
 * 다르고 나머지는 같다. 다이얼로그 틀, 뷰 모드 전환, 지연 로딩, 가로 스크롤,
 * 크게 보기는 전부 여기가 맡고 정보 패널과 이미지 요소만 슬롯으로 받는다.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 화면에는 안 보이고 스크린리더용 제목으로만 쓴다. 보이는 제목은 정보 패널이 그린다 */
    title?: string;
    /** 표시할 이미지 URL 목록. 비동기로 채워도 된다 */
    urls: string[];
    isLoading?: boolean;
    error?: string | null;
    /** 대상이 선택되어 있는지. false면 안내 문구만 그린다 */
    hasTarget?: boolean;
    emptyMessage?: string;
    /** 가로 스크롤 휠 배속 */
    scrollSpeed?: number;
  }>(),
  {
    title: "",
    isLoading: false,
    error: null,
    hasTarget: true,
    emptyMessage: "선택된 항목이 없습니다.",
    scrollSpeed: 1,
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const { viewMode, setViewMode } = usePreviewViewMode();

const dialogOpen = computed({
  get: () => props.open,
  set: (value) => emit("update:open", value),
});

/** 크게 보고 있는 페이지. null이면 닫힘 */
const lightboxIndex = ref<number | null>(null);

// 크게 보기 중의 Esc는 크게 보기만 닫는다
const handleEscape = (event: KeyboardEvent) => {
  if (lightboxIndex.value === null) return;
  event.preventDefault();
  lightboxIndex.value = null;
};

// 세로 휠을 가로 이동으로 바꾼다
const handleWheelScroll = (event: WheelEvent) => {
  const container = event.currentTarget as HTMLElement;
  event.preventDefault();
  container.scrollLeft += (event.deltaY + event.deltaX) * props.scrollSpeed;
};

const scrollContainer = ref<HTMLElement | null>(null);
const gridContainer = ref<HTMLElement | null>(null);
const imageRefs = ref<HTMLElement[]>([]);
const loadedImages = ref<Set<number>>(new Set());
let observer: IntersectionObserver | null = null;

const disconnectObserver = () => {
  observer?.disconnect();
  observer = null;
};

/**
 * 화면에 들어온 칸만 로드하도록 감시를 건다.
 *
 * root를 전역 셀렉터가 아니라 템플릿 ref로 잡는다. 셀렉터로 찾으면 미리보기
 * 다이얼로그가 둘 이상 마운트됐을 때 남의 컨테이너를 root로 물어 엉뚱한 칸이
 * 로드된다.
 */
const initObserver = () => {
  disconnectObserver();
  const root =
    viewMode.value === "scroll" ? scrollContainer.value : gridContainer.value;

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const index = Number(entry.target.getAttribute("data-index") ?? -1);
        if (index >= 0) loadedImages.value.add(index);
      });
    },
    { root, rootMargin: "0px", threshold: 0.1 },
  );

  imageRefs.value.forEach((element) => element && observer?.observe(element));
};

watch(
  () => props.open,
  (open) => {
    lightboxIndex.value = null;
    if (open) {
      loadedImages.value.clear();
      nextTick(initObserver);
    } else {
      disconnectObserver();
    }
  },
  { immediate: true },
);

// URL이 뒤늦게 도착하는 쪽(갤러리)은 여기서 감시를 다시 건다
watch(
  () => props.urls,
  () => {
    lightboxIndex.value = null;
    loadedImages.value.clear();
    if (props.open) nextTick(initObserver);
  },
);

watch(viewMode, () => {
  if (props.open && props.urls.length > 0) nextTick(initObserver);
});

onUnmounted(disconnectObserver);
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent
      class="flex h-[90vh] flex-col sm:max-w-[90vw]"
      :aria-describedby="undefined"
      @close-auto-focus.prevent
      @escape-key-down="handleEscape"
    >
      <DialogTitle class="sr-only">{{ title || "책 정보" }}</DialogTitle>

      <div v-if="hasTarget" class="flex flex-1 flex-col overflow-hidden">
        <slot name="info" />

        <div class="mb-2 flex items-center gap-2">
          <slot name="toolbar" />
          <ToggleGroup
            class="ml-auto"
            type="single"
            :model-value="viewMode"
            variant="outline"
            size="sm"
            @update:model-value="setViewMode"
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
          <div v-if="isLoading" class="flex h-full items-center justify-center">
            <p class="text-muted-foreground">미리보기 이미지 불러오는 중...</p>
          </div>
          <div
            v-else-if="error"
            class="text-destructive flex h-full items-center justify-center"
          >
            <p>{{ error }}</p>
          </div>

          <!-- 가로 스크롤 뷰. 이미지를 누르면 크게 보기가 열린다 -->
          <div
            v-else-if="urls.length > 0 && viewMode === 'scroll'"
            ref="scrollContainer"
            class="flex h-full space-x-4 overflow-x-auto rounded-md border p-2"
            @wheel="handleWheelScroll"
          >
            <div
              v-for="(url, index) in urls"
              :key="index"
              ref="imageRefs"
              :data-index="index"
              class="flex h-full max-w-full flex-shrink-0 cursor-zoom-in items-center justify-center [&_img]:max-w-full"
              @click="lightboxIndex = index"
            >
              <slot
                name="scroll-image"
                :url="url"
                :index="index"
                :loaded="loadedImages.has(index)"
              />
            </div>
          </div>

          <!-- 그리드 뷰 -->
          <div
            v-else-if="urls.length > 0 && viewMode === 'grid'"
            ref="gridContainer"
            class="grid grid-cols-3 gap-2 rounded-md border p-2 sm:grid-cols-5"
          >
            <div
              v-for="(url, index) in urls"
              :key="'grid-' + index"
              ref="imageRefs"
              :data-index="index"
              class="cursor-zoom-in overflow-hidden rounded"
              @click="lightboxIndex = index"
            >
              <slot
                name="grid-image"
                :url="url"
                :index="index"
                :loaded="loadedImages.has(index)"
              />
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
        {{ emptyMessage }}
      </div>

      <PageLightbox
        v-if="lightboxIndex !== null && urls.length > 0"
        v-model:index="lightboxIndex"
        :urls="urls"
        @close="lightboxIndex = null"
      >
        <template #default="{ url, index }">
          <slot name="large-image" :url="url" :index="index" />
        </template>
      </PageLightbox>
    </DialogContent>
  </Dialog>
</template>
