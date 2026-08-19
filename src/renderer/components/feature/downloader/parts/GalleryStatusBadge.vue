<script setup lang="ts">
import type { CardStatus } from "@/lib/galleryCard";
import { Icon } from "@iconify/vue";
import { computed } from "vue";

const props = defineProps<{
  status: CardStatus;
}>();

// 상태별 아이콘과 색. 배경색 칠 대신 이 배지 하나로 상태를 말합니다.
const ICONS: Record<string, string> = {
  owned: "solar:check-circle-bold",
  downloading: "solar:download-minimalistic-bold",
  failed: "solar:close-circle-bold",
};

const TONES: Record<string, string> = {
  owned: "bg-emerald-500 text-white",
  downloading: "bg-primary text-primary-foreground",
  failed: "bg-destructive text-white",
};

const icon = computed(() => ICONS[props.status.kind] ?? "");
const tone = computed(() => TONES[props.status.kind] ?? "");
</script>

<template>
  <!--
    세로 패딩만 올리고 알약 대신 각진 칩으로 맞춘 비율이다. 가로 패딩·아이콘까지
    키우면 폭이 늘어 표지를 가린다.

    부모는 flex 컨테이너여야 한다. `inline-flex`라 block 부모 안에서는 베이스라인
    정렬을 받아, 부모 line-height가 배지보다 크면 그 차이만큼 아래로 밀린다.
  -->
  <span
    v-if="status.badgeLabel"
    class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-none font-semibold whitespace-nowrap shadow-sm"
    :class="tone"
  >
    <Icon v-if="icon" :icon="icon" class="h-3 w-3" />
    {{ status.badgeLabel }}
  </span>
</template>
