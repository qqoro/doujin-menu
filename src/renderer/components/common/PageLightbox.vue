<script setup lang="ts">
import { useWindowEvent } from "@/composables/useWindowEvent";
import { Icon } from "@iconify/vue";

/**
 * 미리보기 페이지 크게 보기. 다이얼로그 안을 덮는다 — 밖으로 텔레포트하면
 * 다이얼로그가 바깥 클릭으로 보고 통째로 닫힌다.
 *
 * 좌우 가장자리를 누르면 넘기고, 그 밖은 어디를 눌러도 닫힌다.
 * Esc는 다이얼로그가 먼저 받으므로 셸이 가로채서 닫는다.
 */
const props = defineProps<{ urls: string[] }>();

const index = defineModel<number>("index", { required: true });

const emit = defineEmits<{ close: [] }>();

const go = (delta: number) => {
  const next = index.value + delta;
  if (next >= 0 && next < props.urls.length) index.value = next;
};

useWindowEvent("keydown", (event: KeyboardEvent) => {
  if (event.key === "ArrowRight") go(1);
  else if (event.key === "ArrowLeft") go(-1);
  else return;
  event.preventDefault();
});

// 트랙패드는 한 번 쓸 때 휠 이벤트가 수십 번 온다. 한 장씩만 넘기도록 묶는다
const WHEEL_GAP = 60;
let lastWheel = 0;
const handleWheel = (event: WheelEvent) => {
  const delta = event.deltaY + event.deltaX;
  if (delta === 0) return;
  const now = performance.now();
  if (now - lastWheel < WHEEL_GAP) return;
  lastWheel = now;
  go(delta > 0 ? 1 : -1);
};
</script>

<template>
  <div
    class="absolute inset-0 z-20 flex cursor-zoom-out items-center justify-center overflow-hidden rounded-xl bg-black/90"
    @click="emit('close')"
    @wheel.prevent="handleWheel"
  >
    <div
      class="flex h-full w-full items-center justify-center p-4 [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-contain"
    >
      <slot :url="urls[index]" :index="index" />
    </div>

    <!-- 끝 페이지에서도 영역은 남겨 둔다. 비우면 가장자리 클릭이 닫기로 새어 나간다 -->
    <button
      type="button"
      class="absolute inset-y-0 left-0 flex w-[22%] cursor-pointer items-center justify-start pl-6 text-white opacity-30 transition-opacity hover:opacity-100"
      aria-label="이전 페이지"
      @click.stop="go(-1)"
    >
      <Icon
        v-show="index > 0"
        icon="solar:alt-arrow-left-linear"
        class="h-10 w-10"
      />
    </button>
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex w-[22%] cursor-pointer items-center justify-end pr-6 text-white opacity-30 transition-opacity hover:opacity-100"
      aria-label="다음 페이지"
      @click.stop="go(1)"
    >
      <Icon
        v-show="index < urls.length - 1"
        icon="solar:alt-arrow-right-linear"
        class="h-10 w-10"
      />
    </button>

    <span
      class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-0.5 text-xs text-white tabular-nums"
    >
      {{ index + 1 }} / {{ urls.length }}
    </span>
  </div>
</template>
