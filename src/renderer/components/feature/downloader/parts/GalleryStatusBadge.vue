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
    `rounded-full` + `py-0.5`이면 높이 15px에 폭 53px이라 3.6:1로 납작하게
    늘어집니다. 세로 패딩만 올리고 알약 대신 각진 칩으로 바꿔 53×19(2.8:1)로
    맞췄습니다. 가로 패딩과 아이콘은 건드리지 않습니다 — 그것까지 키우면
    폭이 같이 늘어 비율이 안 좋아지는 데다 표지를 가립니다.

    **부모는 반드시 flex 컨테이너여야 합니다.** 이 배지는 `inline-flex`라
    block 부모 안에서는 베이스라인 정렬을 받습니다. 부모의 line-height가
    배지보다 크면(카드 기본값 24px > 배지 21px) 그 차이만큼 배지가 아래로
    밀려, `top-2 left-2`를 줘도 위 여백만 6px쯤 더 벌어집니다.
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
