<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import {
  BOOK_ASPECT,
  listCardScaleStyle,
  listThumbnailSize,
} from "@/lib/cardLayout";
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
    /** 표지를 카드와 별개의 클릭 대상으로 만든다 (미리보기 열기 등) */
    zoomable?: boolean;
    /** 삭제 예정처럼 곧 사라질 항목임을 표지·본문을 흐려서 알린다 */
    dimmed?: boolean;
  }>(),
  {
    isOffline: false,
    isFavorite: false,
    aspect: BOOK_ASPECT,
    zoomable: false,
    dimmed: false,
  },
);

/**
 * 표지 흐리기. 오프라인과 겹칠 수 있어 클래스를 한쪽만 고른다.
 * 둘 다 붙이면 같은 속성이 중복돼 어느 값이 이길지 CSS 순서에 달린다.
 */
const coverDimClass = computed(() => {
  if (props.dimmed) return "opacity-40 grayscale";
  if (props.isOffline) return "opacity-50 grayscale";
  return "";
});

/** Ctrl/Cmd+클릭 판별을 위해 원본 마우스 이벤트를 그대로 올린다 */
const emit = defineEmits<{
  click: [event: MouseEvent];
  thumbnailClick: [event: MouseEvent];
}>();

/**
 * `zoomable`일 때만 표지 클릭을 가로챈다. 전파를 막지 않으면 미리보기를 열면서
 * 카드 클릭(선택·열기)까지 같이 발생한다.
 */
const handleThumbnailClick = (event: MouseEvent) => {
  if (!props.zoomable) return;
  event.stopPropagation();
  emit("thumbnailClick", event);
};

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

/** 카드 안쪽 글자·여백도 같은 배율로 키운다. `listCardScaleStyle` 주석 참고 */
const scaleStyle = computed(() => listCardScaleStyle(uiStore.thumbnailZoom));
</script>

<template>
  <!--
    리스트 행 카드의 공통 골격. 라이브러리·읽음 기록·(이후)시리즈가 공유한다.
    Book 타입에 의존하지 않고 표지 URL만 받아 어떤 엔티티 카드에도 쓸 수 있다.
  -->
  <!--
    `[&_[data-size=sm]]:text-[0.8em]`은 셸 안의 `Button size="sm"`을 위한 것이다.
    그 변형만 글자 크기를 `text-[0.8rem]`으로 박아 둬서 `--text-*` 재정의가
    안 먹는다. 후손 선택자라 특이도가 이겨 버튼 쪽 유틸을 덮는다.
  -->
  <div
    class="hover:bg-muted/50 relative flex h-full cursor-pointer gap-3.5 overflow-hidden rounded-lg border p-3 transition-colors [&_[data-size=sm]]:text-[0.8em]"
    :style="scaleStyle"
    @click="emit('click', $event)"
  >
    <div
      class="relative shrink-0 overflow-hidden rounded-md"
      :class="{ 'cursor-zoom-in': zoomable }"
      :style="{
        width: `${thumbSize.width}px`,
        height: `${thumbSize.height}px`,
      }"
      @click="handleThumbnailClick"
    >
      <img
        :src="coverUrl"
        :alt="alt"
        class="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
        :class="coverDimClass"
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

    <div
      class="flex min-w-0 flex-1 flex-col gap-1.5"
      :class="{ 'opacity-55': dimmed }"
    >
      <slot name="content" />
    </div>

    <!-- 액션 열. 폭 고정 여부와 버튼 구성은 화면이 정한다 -->
    <slot name="actions" />

    <!--
      카드 전체를 덮는 상태 표시용 자리. 루트의 hover 배경과 싸우지 않도록
      배경색 대신 겹치는 층으로 둔다.
    -->
    <slot name="overlay" />
  </div>
</template>
