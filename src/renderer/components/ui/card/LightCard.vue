<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

// 성능 최적화용 경량 카드 컴포넌트.
// reka-nova 기본 Card.vue는 :has() 관계형 선택자를 사용하는데,
// 이 selector는 CSS zoom 등 전체 스타일 재계산 시 비선형 비용을 유발한다.
// 라이브러리 그리드처럼 카드를 수백 개 렌더링하는 핫패스에서는
// :has() 없는 이 경량 버전을 사용해 줌/스크롤 성능을 회복한다.
// 시각적 구조는 기본 Card와 동일하게 유지하되 group/card 컨텍스트를 보존하여
// CardContent/CardFooter 등 자식 컴포넌트가 정상 동작하도록 한다.
const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="card"
    :class="cn(
      'bg-card text-card-foreground ring-foreground/10 group/card flex flex-col overflow-hidden rounded-xl text-sm ring-1',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
