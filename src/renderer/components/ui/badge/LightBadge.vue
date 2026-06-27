<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

// 성능 최적화용 경량 배지.
// reka-nova 기본 badgeVariants는 두 가지 성능 병목을 갖는다:
// 1) has-data-[icon=inline-end]/has-data-[icon=inline-start] :has() 셀렉터 — 본 프로젝트에선
//    data-icon을 쓰지 않아 매칭되지 않지만, 스타일 재계산 시마다 모든 배지에서 평가됨.
// 2) transition-all — border-radius 등 비컴포지팅 속성까지 애니메이션 대상이 되어
//    "Compositing failed: Unsupported CSS property: border-radius" 폴백 → CPU 페인트 폭발.
// 태그처럼 화면에 많이 렌더링되는 곳에서는 :has() 제거 + transition-colors(색상만) 경량 버전 사용.
// 시각은 기본 Badge(default variant)와 동일하게 유지한다.
const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="badge"
    data-variant="default"
    :class="cn(
      'bg-primary text-primary-foreground [a]:hover:bg-primary/80 h-5 gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-colors [&>svg]:size-3! group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
