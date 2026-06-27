<script setup lang="ts">
import { ipcRenderer } from "@/api";
import DownloadQueuePopover from "@/components/feature/downloader/DownloadQueuePopover.vue";
import { Icon } from "@iconify/vue";
import { onMounted, onUnmounted, ref } from "vue";

const isMaximized = ref(false);

const minimizeWindow = () => ipcRenderer.send("minimize-window");
const maximizeToggleWindow = () => ipcRenderer.send("maximize-toggle-window");
const closeWindow = () => ipcRenderer.send("close-window");

onMounted(async () => {
  // 초기 창 상태 가져오기
  isMaximized.value = await ipcRenderer.invoke("get-window-maximized-state");

  // 창 상태 변경 이벤트 리스너 등록
  ipcRenderer.on("window-maximized", (_event, ...args) => {
    isMaximized.value = args[0] as boolean;
  });
});

onUnmounted(() => {
  // 컴포넌트 언마운트 시 이벤트 리스너 제거 (메모리 누수 방지)
  ipcRenderer.removeAllListeners("window-maximized");
});
</script>

<template>
  <header
    class="bg-muted flex h-9 items-center justify-between border-b pl-4"
    style="-webkit-app-region: drag"
  >
    <div class="flex items-center gap-2">
      <Icon
        icon="solar:book-bookmark-bold-duotone"
        class="text-primary size-5"
      />
      <h1 class="text-foreground text-sm font-semibold">동인메뉴판</h1>
    </div>

    <div class="flex h-full items-center">
      <!-- 다운로드 큐: no-drag 영역 유지 -->
      <div
        class="flex h-full items-center px-1"
        style="-webkit-app-region: no-drag"
      >
        <DownloadQueuePopover />
      </div>

      <!-- 윈도우 타이틀바 스타일 창 제어 버튼 -->
      <div
        class="flex h-full items-stretch"
        style="-webkit-app-region: no-drag"
      >
        <button
          type="button"
          class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex w-12 items-center justify-center transition-colors"
          title="최소화"
          @click="minimizeWindow"
        >
          <Icon icon="lucide:minus" class="size-4" />
        </button>
        <button
          type="button"
          class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex w-12 items-center justify-center transition-colors"
          :title="isMaximized ? '최대화 복원' : '최대화'"
          @click="maximizeToggleWindow"
        >
          <Icon
            :icon="isMaximized ? 'lucide:copy' : 'lucide:square'"
            class="size-4"
          />
        </button>
        <button
          type="button"
          class="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground flex w-12 items-center justify-center transition-colors"
          title="닫기"
          @click="closeWindow"
        >
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
* {
  user-select: none;
}
</style>
