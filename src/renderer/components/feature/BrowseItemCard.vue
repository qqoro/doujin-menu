<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { buildCoverUrl } from "@/lib/bookCard";
import { computed } from "vue";
import CoverCardShell from "./parts/CoverCardShell.vue";

const props = defineProps<{
  name: string;
  count: number;
  coverPath?: string | null;
}>();
const emit = defineEmits<{ click: [] }>();

const coverUrl = computed(() => buildCoverUrl(props.coverPath, 0));
</script>

<template>
  <!-- 라이브러리·시리즈 카드와 같은 CoverCardShell을 쓴다 -->
  <CoverCardShell :cover-url="coverUrl" :alt="name" @click="emit('click')">
    <template #badges>
      <Badge variant="secondary" class="absolute top-2 right-2 z-40">
        {{ count }}권
      </Badge>
    </template>

    <template #overlay>
      <p
        class="line-clamp-2 text-[13px] leading-snug font-bold break-all [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]"
        :title="name"
      >
        {{ name }}
      </p>
    </template>
  </CoverCardShell>
</template>
