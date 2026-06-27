<script setup lang="ts">
import { Icon } from "@iconify/vue";

// 페이지 헤더 공용 컴포넌트
// - icon: Iconify 아이콘 이름 (예: "solar:library-bold-duotone")
// - title: 페이지 타이틀 텍스트
// 슬롯:
// - #help: 타이틀 바로 뒤 보조 UI (예: HelpDialog)
// - #actions: 헤더 우측 끝 액션 버튼 영역
defineProps<{
  icon: string;
  title: string;
}>();
</script>

<template>
  <div class="flex items-center justify-between">
    <h1 class="flex items-center gap-2 text-xl font-bold">
      <Icon :icon="icon" class="text-primary h-5 w-5" />
      {{ title }}
      <slot name="help" />
    </h1>
    <div class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
