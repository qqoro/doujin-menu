<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { BOOK_ASPECT, listThumbnailSize } from "@/lib/cardLayout";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 표지 이미지 URL */
    coverUrl: string;
    /** 이미지 대체 텍스트 */
    alt: string;
    /** 오프라인(라이브러리 경로 접근 불가) 상태 표시 */
    isOffline?: boolean;
    /** 즐겨찾기 하트 표시 */
    isFavorite?: boolean;
    /** 표지 세로/가로 비율. 라이브러리 2:3, 히토미 갤러리는 3:4를 넘긴다 */
    aspect?: number;
  }>(),
  { isOffline: false, isFavorite: false, aspect: BOOK_ASPECT },
);

/** Ctrl/Cmd+클릭 판별을 위해 원본 마우스 이벤트를 그대로 올린다 */
const emit = defineEmits<{ click: [event: MouseEvent] }>();

const uiStore = useUiStore();

/**
 * 썸네일 px 치수.
 *
 * 리스트는 CSS `zoom`을 쓸 수 없어(행 높이 동적 측정이 깨진다) 같은 줌 값을
 * 받아 px을 직접 곱한다. 자세한 이유는 `listThumbnailSize` 주석 참고.
 */
const thumbSize = computed(() =>
  listThumbnailSize(uiStore.thumbnailZoom, props.aspect),
);
</script>

<template>
  <!--
    리스트 행 카드의 공통 골격. 라이브러리·읽음 기록·(이후)시리즈가 공유한다.
    Book 타입에 의존하지 않고 표지 URL만 받아 어떤 엔티티 카드에도 쓸 수 있다.
  -->
  <div
    class="hover:bg-muted/50 relative flex h-full cursor-pointer gap-3.5 overflow-hidden rounded-lg border p-3 transition-colors"
    @click="emit('click', $event)"
  >
    <div
      class="relative shrink-0 overflow-hidden rounded-md"
      :style="{
        width: `${thumbSize.width}px`,
        height: `${thumbSize.height}px`,
      }"
    >
      <img
        :src="coverUrl"
        :alt="alt"
        class="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
        :class="{ 'opacity-50 grayscale': isOffline }"
      />
      <Badge
        v-if="isOffline"
        variant="secondary"
        class="absolute top-1.5 left-1.5 gap-1"
      >
        <Icon icon="solar:plug-circle-bold-duotone" class="h-3 w-3" />
        오프라인
      </Badge>
      <div
        v-if="isFavorite"
        class="absolute top-1.5 right-1.5 rounded-full bg-red-500 p-1 text-white"
      >
        <Icon icon="solar:heart-bold" class="h-4 w-4" />
      </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <slot name="content" />
    </div>

    <!-- 액션 열. 폭 고정 여부와 버튼 구성은 화면이 정한다 -->
    <slot name="actions" />
  </div>
</template>
