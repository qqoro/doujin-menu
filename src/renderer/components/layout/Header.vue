<script setup lang="ts">
import { ipcRenderer } from "@/api";
import { Button } from "@/components/ui/button";
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
    class="flex items-center justify-between px-4 py-3 bg-muted border-b"
    style="-webkit-app-region: drag"
  >
    <div class="flex items-center gap-2">
      <Icon
        icon="solar:book-bookmark-bold-duotone"
        class="text-primary size-6"
      />
      <h1 class="text-foreground font-semibold text-lg">동인메뉴판</h1>
    </div>

    <div class="flex items-center gap-2">
      <Button
        class="size-8"
        variant="outline"
        size="icon"
        @click="minimizeWindow"
      >
        <Icon icon="solar:minus-square-line-duotone" class="size-4" />
      </Button>
      <Button
        class="size-8"
        variant="outline"
        size="icon"
        @click="maximizeToggleWindow"
      >
        <Icon
          :icon="
            isMaximized
              ? 'solar:minimize-square-3-line-duotone'
              : 'solar:maximize-square-minimalistic-line-duotone'
          "
          class="size-4"
        />
      </Button>
      <Button
        variant="outline"
        size="icon"
        class="size-8 hover:bg-destructive/80 hover:text-white"
        @click="closeWindow"
      >
        <Icon icon="solar:close-square-line-duotone" class="size-4" />
      </Button>
    </div>
  </header>
</template>

<style scoped>
* {
  user-select: none;
}
</style>
