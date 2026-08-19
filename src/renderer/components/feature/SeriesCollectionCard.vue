<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { computed } from "vue";
import CoverCardShell from "./parts/CoverCardShell.vue";

interface Props {
  series: {
    id: number;
    name: string;
    description: string | null;
    cover_image: string | null;
    is_auto_generated: boolean;
    is_manually_edited: boolean;
    confidence_score: number;
    book_count?: number;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{
  click: [];
  delete: [];
}>();

// 커버는 시리즈 대표 이미지가 없으면 첫 책의 표지로 채워져 온다(핸들러 폴백).
// 둘 다 없으면 셸에 빈 이미지가 들어가므로 placeholder로 대신한다
const coverUrl = computed(() =>
  props.series.cover_image
    ? `file://${props.series.cover_image}`
    : "https://via.placeholder.com/256x384",
);

// 신뢰도 표시
const confidenceLevel = computed(() => {
  const score = props.series.confidence_score;
  if (score >= 0.8) return { label: "신뢰도 높음", class: "bg-green-500/80" };
  if (score >= 0.5) return { label: "신뢰도 중간", class: "bg-yellow-500/80" };
  return { label: "신뢰도 낮음", class: "bg-red-500/80" };
});

// 생성 방식 표시
const creationType = computed(() => {
  if (props.series.is_manually_edited) return "수동";
  if (props.series.is_auto_generated) return "자동";
  return "혼합";
});
</script>

<template>
  <!-- 라이브러리 BookCard와 같은 CoverCardShell을 쓴다.
       데이터가 책이 아니라 시리즈일 뿐, 표지 비율·오버레이·호버 액션은 같다 -->
  <CoverCardShell
    :cover-url="coverUrl"
    :alt="series.name"
    @click="emit('click')"
  >
    <!-- 권수 배지. 호버 액션 오버레이(z-20)보다 위에 둔다 -->
    <template #badges>
      <Badge variant="secondary" class="absolute top-2 right-2 z-40">
        {{ series.book_count || 0 }}권
      </Badge>
    </template>

    <template #overlay>
      <!-- 그림자는 밝은 표지 위에서 흰 글씨 대비가 떨어지는 자리를 보강한다 -->
      <p
        class="line-clamp-2 text-[13px] leading-snug font-bold break-all [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]"
        :title="series.name"
      >
        {{ series.name }}
      </p>
      <p
        v-if="series.description"
        class="mt-0.5 line-clamp-1 text-[11.5px] opacity-95"
        :title="series.description"
      >
        {{ series.description }}
      </p>
      <div class="mt-1 flex flex-wrap items-center gap-1">
        <span
          class="rounded bg-white/20 px-1.5 py-0.5 text-[11px] backdrop-blur-sm"
        >
          {{ creationType }}
        </span>
        <span
          v-if="series.is_auto_generated"
          class="rounded px-1.5 py-0.5 text-[11px]"
          :class="confidenceLevel.class"
        >
          {{ confidenceLevel.label }}
        </span>
      </div>
    </template>

    <!-- 호버 버튼. 예전에는 ⋮ 드롭다운이었으나 라이브러리와 같은 방식으로 맞춘다 -->
    <template #actions>
      <Button
        size="icon-sm"
        variant="secondary"
        title="상세 보기"
        @click.stop="emit('click')"
      >
        <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
      </Button>
      <Button
        size="icon-sm"
        variant="destructive"
        title="삭제"
        @click.stop="emit('delete')"
      >
        <Icon icon="solar:trash-bin-trash-bold-duotone" class="h-4 w-4" />
      </Button>
    </template>
  </CoverCardShell>
</template>
