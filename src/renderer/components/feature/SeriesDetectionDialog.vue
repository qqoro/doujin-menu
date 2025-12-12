<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@iconify/vue";
import { onMounted, ref, watch } from "vue";
import { ipcRenderer } from "@/api";

interface Props {
  open: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [options: any];
}>();

// 설정값 저장
const saveSettings = async () => {
  const settings = {
    minConfidence: minConfidence.value,
    minBooks: minBooks.value,
  };
  await ipcRenderer.invoke("set-config", {
    key: "seriesDetectionSettings",
    value: settings,
  });
};

// 감지 옵션
const minConfidence = ref(0.7);
const minBooks = ref(2);

// config에서 설정값 불러오기
onMounted(async () => {
  const config = (await ipcRenderer.invoke("get-config")) as {
    seriesDetectionSettings?: {
      minConfidence?: number;
      minBooks?: number;
    };
  };
  if (config.seriesDetectionSettings) {
    minConfidence.value = config.seriesDetectionSettings.minConfidence ?? 0.7;
    minBooks.value = config.seriesDetectionSettings.minBooks ?? 2;
  }
});

// 설정값 변경 시 자동 저장
watch([minConfidence, minBooks], () => {
  saveSettings();
});

// 다이얼로그 닫기
const closeDialog = () => {
  emit("update:open", false);
};

// 확정 실행
const handleConfirm = () => {
  emit("confirm", {
    minConfidence: minConfidence.value,
    minBooks: minBooks.value,
  });
};
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Icon
            icon="solar:magic-stick-3-bold-duotone"
            class="text-primary h-5 w-5"
          />
          자동 시리즈 감지 설정
        </DialogTitle>
        <DialogDescription>
          책 제목 패턴을 분석하여 자동으로 시리즈를 감지하고 그룹화합니다.
          <br />
          <span class="text-xs opacity-80">
            • 새 책 추가 시 자동으로 시리즈 감지가 실행됩니다
            <br />
            • 수동으로 편집한 시리즈는 자동 감지에서 제외됩니다
            <br />
            • 이미 시리즈에 속한 책은 재감지되지 않습니다
          </span>
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <!-- 최소 신뢰도 -->
        <div class="space-y-2">
          <Label for="minConfidence">
            최소 신뢰도: {{ (minConfidence * 100).toFixed(0) }}%
          </Label>
          <div class="flex items-center gap-4">
            <input
              id="minConfidence"
              v-model.number="minConfidence"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="flex-1"
            />
            <span class="text-muted-foreground w-12 text-right text-sm">
              {{ (minConfidence * 100).toFixed(0) }}%
            </span>
          </div>
          <p class="text-muted-foreground text-xs">
            이 값 이상의 신뢰도를 가진 시리즈만 자동 생성됩니다. 높을수록
            정확하지만 감지되는 시리즈가 줄어듭니다.
          </p>
        </div>

        <!-- 최소 책 수 -->
        <div class="space-y-2">
          <Label for="minBooks">최소 책 수</Label>
          <Input
            id="minBooks"
            v-model.number="minBooks"
            type="number"
            min="2"
            max="10"
          />
          <p class="text-muted-foreground text-xs">
            시리즈로 인정하기 위한 최소 책 수입니다.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="closeDialog">취소</Button>
        <Button @click="handleConfirm">
          <Icon icon="solar:play-bold-duotone" class="mr-2 h-4 w-4" />
          실행
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
@reference "@/assets/tailwind.css";

input[type="range"] {
  @apply bg-secondary h-2 cursor-pointer appearance-none rounded-lg;
}

input[type="range"]::-webkit-slider-thumb {
  @apply bg-primary h-4 w-4 cursor-pointer appearance-none rounded-full;
}

input[type="range"]::-moz-range-thumb {
  @apply bg-primary h-4 w-4 cursor-pointer rounded-full border-0;
}
</style>
