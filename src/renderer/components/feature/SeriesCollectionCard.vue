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
    class="group bg-card text-card-foreground relative cursor-pointer rounded-lg border shadow-sm transition-all hover:shadow-md"
    @click="emit('click')"
  >
    <!-- 커버 이미지 영역 -->
    <div class="bg-muted relative aspect-[3/4] overflow-hidden rounded-t-lg">
      <img
        v-if="series.cover_image"
        :src="`file://${series.cover_image}`"
        :alt="series.name"
        class="h-full w-full object-cover"
        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
      />
      <div
        v-else
        class="from-primary/10 to-primary/5 flex h-full w-full items-center justify-center bg-gradient-to-br"
      >
        <Icon
          icon="solar:library-bold-duotone"
          class="text-primary/30 h-16 w-16"
        />
      </div>

      <!-- 권수 뱃지 -->
      <div
        class="absolute top-2 right-2 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm"
      >
        {{ series.book_count || 0 }}권
      </div>

      <!-- 옵션 메뉴 -->
      <div
        class="absolute top-2 left-2 opacity-0 transition-opacity group-hover:opacity-100"
      >
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
              class="text-destructive"
              @click.stop="emit('delete')"
            >
              <Icon
                icon="solar:trash-bin-trash-bold-duotone"
                class="mr-2 h-4 w-4"
              />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- 정보 영역 -->
    <div class="space-y-2 p-4">
      <div class="flex items-start justify-between gap-2">
        <h3 class="line-clamp-2 flex-1 font-semibold" :title="series.name">
          {{ series.name }}
        </h3>
      </div>

      <!-- 설명 -->
      <p
        v-if="series.description"
        class="text-muted-foreground line-clamp-2 text-sm"
      >
        {{ series.description }}
      </p>

      <!-- 메타 정보 -->
      <div class="flex items-center gap-2 pt-2">
        <!-- 생성 방식 -->
        <div
          class="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs"
        >
          {{ creationType }}
        </div>

        <!-- 신뢰도 (자동 생성인 경우만) -->
        <div
          v-if="series.is_auto_generated"
          class="rounded px-2 py-0.5 text-xs text-white"
          :class="confidenceLevel.class"
        >
          {{ confidenceLevel.label }}
        </div>
      </div>
    </div>
  </div>
</template>
