<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@iconify/vue";
import { computed } from "vue";

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

// 신뢰도 표시
const confidenceLevel = computed(() => {
  const score = props.series.confidence_score;
  if (score >= 0.8) return { label: "높음", class: "bg-green-500" };
  if (score >= 0.5) return { label: "중간", class: "bg-yellow-500" };
  return { label: "낮음", class: "bg-red-500" };
});

// 생성 방식 표시
const creationType = computed(() => {
  if (props.series.is_manually_edited) return "수동";
  if (props.series.is_auto_generated) return "자동";
  return "혼합";
});
</script>

<template>
  <div
    class="group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md cursor-pointer"
    @click="emit('click')"
  >
    <!-- 커버 이미지 영역 -->
    <div class="aspect-[3/4] relative overflow-hidden rounded-t-lg bg-muted">
      <img
        v-if="series.cover_image"
        :src="`file://${series.cover_image}`"
        :alt="series.name"
        class="w-full h-full object-cover"
        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5"
      >
        <Icon
          icon="solar:library-bold-duotone"
          class="h-16 w-16 text-primary/30"
        />
      </div>

      <!-- 권수 뱃지 -->
      <div
        class="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm"
      >
        {{ series.book_count || 0 }}권
      </div>

      <!-- 옵션 메뉴 -->
      <div class="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger as-child @click.stop>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 bg-black/60 text-white hover:bg-black/80"
            >
              <Icon icon="solar:menu-dots-bold" class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem @click.stop="emit('click')">
              <Icon icon="solar:eye-bold-duotone" class="mr-2 h-4 w-4" />
              상세 보기
            </DropdownMenuItem>
            <DropdownMenuItem
              @click.stop="emit('delete')"
              class="text-destructive"
            >
              <Icon icon="solar:trash-bin-trash-bold-duotone" class="mr-2 h-4 w-4" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- 정보 영역 -->
    <div class="p-4 space-y-2">
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-semibold line-clamp-2 flex-1" :title="series.name">
          {{ series.name }}
        </h3>
      </div>

      <!-- 설명 -->
      <p
        v-if="series.description"
        class="text-sm text-muted-foreground line-clamp-2"
      >
        {{ series.description }}
      </p>

      <!-- 메타 정보 -->
      <div class="flex items-center gap-2 pt-2">
        <!-- 생성 방식 -->
        <div class="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
          {{ creationType }}
        </div>

        <!-- 신뢰도 (자동 생성인 경우만) -->
        <div
          v-if="series.is_auto_generated"
          class="text-xs px-2 py-0.5 rounded text-white"
          :class="confidenceLevel.class"
        >
          {{ confidenceLevel.label }}
        </div>
      </div>
    </div>
  </div>
</template>
