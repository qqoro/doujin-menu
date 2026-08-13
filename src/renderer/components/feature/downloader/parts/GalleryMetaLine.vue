<script setup lang="ts">
import type { MetaField, MetaSource } from "@/lib/galleryCard";
import { buildMetaLine } from "@/lib/galleryCard";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    gallery: MetaSource;
    fields: MetaField[];
    /** ID를 클릭 복사 버튼으로 그릴지. 그리드 카드는 false */
    interactive?: boolean;
  }>(),
  { interactive: false },
);

const emit = defineEmits<{
  "copy-id": [id: number];
  "copy-url": [id: number];
}>();

const parts = computed(() => buildMetaLine(props.gallery, props.fields));
</script>

<template>
  <p class="flex items-center gap-1.5 overflow-hidden text-xs tabular-nums">
    <template v-for="(part, index) in parts" :key="part.key">
      <span v-if="index > 0" class="opacity-40">·</span>
      <!-- 클릭: id 검색어 복사 / 우클릭: 히토미 갤러리 주소 복사 -->
      <button
        v-if="part.key === 'id' && interactive"
        class="m-0 cursor-pointer border-none bg-transparent p-0 text-current hover:underline"
        @click.stop="emit('copy-id', gallery.id)"
        @contextmenu.prevent.stop="emit('copy-url', gallery.id)"
      >
        {{ part.text }}
      </button>
      <span v-else class="truncate">{{ part.text }}</span>
    </template>
  </p>
</template>
