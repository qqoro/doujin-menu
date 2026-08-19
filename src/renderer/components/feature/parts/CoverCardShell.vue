<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Icon } from "@iconify/vue";

withDefaults(
  defineProps<{
    /** 표지 이미지 URL */
    coverUrl: string;
    /** 이미지 대체 텍스트 */
    alt: string;
    /** 오프라인(라이브러리 경로 접근 불가) 상태 표시 */
    isOffline?: boolean;
    /** 즐겨찾기 하트 표시 */
    isFavorite?: boolean;
  }>(),
  { isOffline: false, isFavorite: false },
);

/** Ctrl/Cmd+클릭 판별을 위해 원본 마우스 이벤트를 그대로 올린다 */
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <!-- 그리드 카드의 공통 골격. Book 타입에 의존하지 않고 표지 URL만 받는다 -->
  <div
    class="group relative cursor-pointer overflow-hidden rounded-lg border"
    @click="emit('click', $event)"
  >
    <!-- 나머지가 전부 absolute라 카드 높이가 표지 폭으로 확정된다 -->
    <div class="relative aspect-[2/3] h-auto w-full overflow-hidden">
      <img
        :src="coverUrl"
        :alt="alt"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
        :class="{ 'opacity-50 grayscale': isOffline }"
      />
    </div>

    <!-- 상태 배지. 호버 액션 오버레이(z-20)보다 위에 둔다 -->
    <Badge
      v-if="isOffline"
      variant="secondary"
      class="absolute top-2 left-2 z-40 gap-1"
    >
      <Icon icon="solar:plug-circle-bold-duotone" class="h-3 w-3" />
      오프라인
    </Badge>
    <div
      v-if="isFavorite"
      class="absolute top-2 right-2 z-40 rounded-full bg-red-500 p-1 text-white"
    >
      <Icon icon="solar:heart-bold" class="h-4 w-4" />
    </div>

    <!-- 추가 배지 자리 (시리즈 카드의 권수 배지 등) -->
    <slot name="badges" />

    <!-- 호버 시 배경 dim -->
    <div
      class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/50"
    ></div>

    <!--
      하단 정보. z-30 아래로 내리면 안 된다 — 호버 버튼 영역이 `absolute inset-0
      z-20`으로 카드 전면을 덮는데 `opacity-0`은 히트테스트에 영향이 없어, 이
      영역이 더 낮으면 작가·태그 클릭이 영영 안 걸린다.

      영역 자체는 pointer-events-none이라 제목을 누르면 클릭이 카드로 통과한다.
      필터를 거는 링크에만 pointer-events-auto를 준다.
    -->
    <div
      v-if="$slots.overlay"
      class="pointer-events-none absolute right-0 bottom-0 left-0 z-30 bg-gradient-to-t from-black/80 via-black/60 to-transparent px-2.5 pt-7 pb-2.5 text-white"
    >
      <slot name="overlay" />
    </div>

    <!--
      버튼 영역 (호버 시 표시). 카드 최소 폭이 184px이고 `Button`은
      `shrink-0 whitespace-nowrap`이라 줄지 않는다. 아이콘 버튼만 쓰면 여유가
      있지만 문구를 달면 넘친다.
    -->
    <div
      v-if="$slots.actions"
      class="absolute inset-0 z-20 flex flex-wrap items-center justify-center gap-2 px-2 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
