<script setup lang="ts">
import { LightBadge } from "@/components/ui/badge";
import {
  tagTone,
  toTagParts,
  type TagSource,
  type TagSurface,
} from "@/lib/tagBadge";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "vue";
import { computed } from "vue";

/**
 * 태그 뱃지. 종류는 색으로만 구분하고 접두어는 숨긴다. 클릭 동작은 화면마다
 * 달라서 리스너는 그대로 루트에 떨어진다.
 */
const props = withDefaults(
  defineProps<{
    tag: TagSource;
    surface?: TagSurface;
    class?: HTMLAttributes["class"];
  }>(),
  { surface: "card", class: undefined },
);

const parts = computed(() => toTagParts(props.tag));
</script>

<template>
  <LightBadge
    :class="
      cn(
        'cursor-pointer rounded-full px-1.5 py-0.5 text-xs',
        tagTone(parts.kind, surface),
        props.class,
      )
    "
  >
    {{ parts.name }}
    <slot />
  </LightBadge>
</template>
