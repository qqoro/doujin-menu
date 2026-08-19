<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { computed } from "vue";
import RowCardShell from "./parts/RowCardShell.vue";

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

const coverUrl = computed(() =>
  props.series.cover_image
    ? `file://${props.series.cover_image}`
    : "https://via.placeholder.com/256x384",
);

const confidenceLevel = computed(() => {
  const score = props.series.confidence_score;
  if (score >= 0.8) return { label: "신뢰도 높음", class: "bg-green-500/80" };
  if (score >= 0.5) return { label: "신뢰도 중간", class: "bg-yellow-500/80" };
  return { label: "신뢰도 낮음", class: "bg-red-500/80" };
});

const creationType = computed(() => {
  if (props.series.is_manually_edited) return "수동";
  if (props.series.is_auto_generated) return "자동";
  return "혼합";
});
</script>

<template>
  <!-- 라이브러리·읽음 기록과 같은 RowCardShell. 썸네일이 줌을 따라간다 -->
  <RowCardShell :cover-url="coverUrl" :alt="series.name" @click="emit('click')">
    <template #content>
      <h3 class="text-[15px] leading-snug font-bold" :title="series.name">
        {{ series.name }}
      </h3>
      <p
        v-if="series.description"
        class="text-muted-foreground line-clamp-2 text-[12.5px]"
      >
        {{ series.description }}
      </p>
      <div class="flex flex-wrap items-center gap-1">
        <Badge variant="secondary">{{ series.book_count || 0 }}권</Badge>
        <Badge variant="outline">{{ creationType }}</Badge>
        <Badge
          v-if="series.is_auto_generated"
          class="text-white"
          :class="confidenceLevel.class"
        >
          {{ confidenceLevel.label }}
        </Badge>
      </div>
    </template>

    <!-- 버튼 열. 라이브러리 리스트와 같이 폭을 고정해 본문 폭이 흔들리지 않게 한다 -->
    <template #actions>
      <div class="flex w-[92px] shrink-0 flex-col gap-1.5">
        <Button size="sm" variant="outline" @click.stop="emit('click')">
          <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
          상세 보기
        </Button>
        <Button size="sm" variant="destructive" @click.stop="emit('delete')">
          <Icon
            icon="solar:trash-bin-minimalistic-bold-duotone"
            class="h-4 w-4"
          />
          삭제
        </Button>
      </div>
    </template>
  </RowCardShell>
</template>
