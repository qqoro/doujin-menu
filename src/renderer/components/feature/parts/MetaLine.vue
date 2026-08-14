<script setup lang="ts">
import type { MetaPart } from "@/lib/cardLayout";

withDefaults(
  defineProps<{
    /** 조각을 만드는 건 화면입니다. 이 컴포넌트는 `·`로 잇기만 합니다 */
    parts: MetaPart[];
    /** ID를 클릭 가능한 버튼으로 그릴지 */
    interactive?: boolean;
  }>(),
  { interactive: false },
);

const emit = defineEmits<{
  select: [part: MetaPart];
  context: [part: MetaPart];
}>();
</script>

<template>
  <p class="flex items-center gap-1.5 overflow-hidden text-xs tabular-nums">
    <template v-for="(part, index) in parts" :key="part.key">
      <span v-if="index > 0" class="opacity-40">·</span>
      <button
        v-if="part.key === 'id' && interactive"
        class="m-0 cursor-pointer border-none bg-transparent p-0 text-current hover:underline"
        @click.stop="emit('select', part)"
        @contextmenu.prevent.stop="emit('context', part)"
      >
        {{ part.text }}
      </button>
      <span v-else class="truncate">{{ part.text }}</span>
    </template>
  </p>
</template>
