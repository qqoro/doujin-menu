<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    /** 0(미평가) ~ 5 */
    modelValue?: number;
    /** 값을 바꿀 수 없는 표시 전용 모드 */
    readonly?: boolean;
    /** 별 하나의 크기 클래스 */
    starClass?: string;
  }>(),
  { modelValue: 0, readonly: false, starClass: "h-4 w-4" },
);

const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const STARS = [1, 2, 3, 4, 5];

/** 호버 중인 별. 0이면 호버 없음 */
const hovered = ref(0);

// 호버 중에는 누를 경우의 결과를 미리 보여준다
const shown = computed(() =>
  hovered.value > 0 ? hovered.value : props.modelValue,
);

/**
 * 별점은 표지 위 오버레이 안에 놓인다. 전파를 막지 않으면 별을 누를 때마다
 * 카드 클릭이 같이 걸려 뷰어가 열린다. 표시 전용일 때는 반대로 그냥 흘려보내
 * 카드 클릭이 정상 동작하게 둔다.
 */
const handleClick = (event: MouseEvent, star: number) => {
  if (props.readonly) return;
  event.preventDefault();
  event.stopPropagation();
  // 같은 별을 다시 누르면 평가를 해제한다
  emit("update:modelValue", star === props.modelValue ? 0 : star);
};

const handleEnter = (star: number) => {
  if (props.readonly) return;
  hovered.value = star;
};
</script>

<template>
  <div
    class="flex items-center gap-px"
    :class="readonly ? 'pointer-events-none' : 'pointer-events-auto'"
    @mouseleave="hovered = 0"
  >
    <button
      v-for="star in STARS"
      :key="star"
      type="button"
      data-star
      :data-filled="star <= shown ? 'true' : 'false'"
      :aria-label="`${star}점`"
      :title="readonly ? undefined : `별점 ${star}점`"
      class="m-0 border-none bg-transparent p-0 leading-none text-current transition-transform"
      :class="readonly ? '' : 'cursor-pointer hover:scale-110'"
      @mouseenter="handleEnter(star)"
      @click="handleClick($event, star)"
    >
      <Icon
        :icon="star <= shown ? 'solar:star-bold' : 'solar:star-line-duotone'"
        :class="[starClass, star <= shown ? 'text-amber-400' : 'opacity-60']"
      />
    </button>
  </div>
</template>
