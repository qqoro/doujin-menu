<script setup lang="ts">
import { Progress } from "@/components/ui/progress";
import { useLibraryScanStore } from "@/store/libraryScanStore";
import { Icon } from "@iconify/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const libraryScanStore = useLibraryScanStore();
const {
  isScanning,
  scanProgress,
  progressPercent,
  phaseMessage,
  statsSummary,
} = storeToRefs(libraryScanStore);

// 현재 처리 중인 파일명 (말줄임표 처리)
const displayFileName = computed(() => {
  if (!scanProgress.value?.currentFile) return null;
  const fileName = scanProgress.value.currentFile;
  // 파일명이 너무 길면 말줄임표 처리
  if (fileName.length > 50) {
    return fileName.substring(0, 47) + "...";
  }
  return fileName;
});

// 진행률 텍스트 (예: "50/100")
const progressText = computed(() => {
  if (!scanProgress.value) return "";
  const { processedCount, totalCount } = scanProgress.value;
  if (totalCount === 0) return "";
  return `${processedCount}/${totalCount}`;
});
</script>

<template>
  <div
    v-if="isScanning || scanProgress?.phase === 'completed'"
    class="bg-primary/5 border-primary/20 mb-4 rounded-lg border p-4"
  >
    <!-- 완료 상태 -->
    <div
      v-if="scanProgress?.phase === 'completed'"
      class="flex items-center gap-3"
    >
      <div
        class="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
      >
        <Icon
          icon="solar:check-circle-bold-duotone"
          class="text-primary h-6 w-6"
        />
      </div>
      <div class="flex-grow">
        <div class="flex items-center gap-2">
          <span class="font-medium">스캔 완료</span>
          <span v-if="statsSummary" class="text-muted-foreground text-sm">
            ({{ statsSummary }})
          </span>
        </div>
        <div class="text-muted-foreground text-xs">
          총 {{ scanProgress.processedCount }}개 항목 처리됨
        </div>
      </div>
      <button
        class="text-muted-foreground hover:text-foreground text-sm underline"
        @click="libraryScanStore.resetScanState()"
      >
        닫기
      </button>
    </div>

    <!-- 스캔 중 상태 -->
    <div v-else class="flex items-center gap-3">
      <div
        class="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
      >
        <Icon icon="svg-spinners:ring-resize" class="text-primary h-6 w-6" />
      </div>
      <div class="min-w-0 flex-grow">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="font-medium">{{ phaseMessage }}</span>
          <span class="text-muted-foreground text-sm">{{ progressText }}</span>
        </div>
        <Progress :value="progressPercent" class="mb-2 h-2" />
        <div class="flex items-center justify-between gap-4">
          <div
            v-if="displayFileName"
            class="text-muted-foreground truncate text-xs"
          >
            {{ displayFileName }}
          </div>
          <div
            v-if="statsSummary"
            class="text-muted-foreground flex-shrink-0 text-xs"
          >
            {{ statsSummary }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
