<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePwaInstall } from "@/composables/usePwaInstall";
import { Icon } from "@iconify/vue";
import { ref } from "vue";

const { mode, install } = usePwaInstall();
const guideOpen = ref(false);

const onClick = () => {
  if (mode.value === "prompt") void install();
  else guideOpen.value = true;
};
</script>

<template>
  <template v-if="mode">
    <Button variant="ghost" size="sm" class="h-7 gap-1 px-2" @click="onClick">
      <Icon icon="solar:download-minimalistic-bold-duotone" class="size-4" />
      앱 설치
    </Button>
    <Dialog v-model:open="guideOpen">
      <DialogContent class="max-w-xs">
        <DialogHeader>
          <DialogTitle>홈 화면에 앱으로 추가</DialogTitle>
          <DialogDescription class="sr-only">
            사파리에서 홈 화면에 추가하는 방법
          </DialogDescription>
        </DialogHeader>
        <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>
            사파리 아래쪽의
            <Icon
              icon="solar:square-share-line-bold-duotone"
              class="inline size-4 align-text-bottom"
            />
            공유 버튼을 누르세요
          </li>
          <li>"홈 화면에 추가"를 누르세요</li>
          <li>오른쪽 위 "추가"를 누르세요</li>
        </ol>
        <p class="text-muted-foreground text-sm">
          설치한 앱을 처음 열면 PC에 표시된 연결 코드를 한 번 더 입력하세요.
        </p>
      </DialogContent>
    </Dialog>
  </template>
</template>
