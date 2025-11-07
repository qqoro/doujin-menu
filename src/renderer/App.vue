<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner";
import { useUiStore } from "@/store/uiStore";
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import { toast } from "vue-sonner";
import { ipcRenderer } from "./api";
import { useWindowEvent } from "./composable/useWindowEvent";
import { useTheme } from "./composable/useTheme";

const keyHandler = (event: KeyboardEvent) => {
  if (
    (event.ctrlKey && event.key.toLowerCase() === "r") ||
    event.key.toLowerCase() === "f5"
  ) {
    location.reload();
  } else if (event.ctrlKey && event.key.toLowerCase() === "w") {
    window.close();
  }
};
useWindowEvent("keydown", keyHandler);

const uiStore = useUiStore();
const { initializeTheme } = useTheme();

onMounted(async () => {
  // 테마 초기화
  await initializeTheme();

  const shouldBeLocked = await ipcRenderer.invoke("get-initial-lock-status");
  if (shouldBeLocked) {
    uiStore.setLocked(true);
  }

  ipcRenderer.on("update-status", (_event, ...args) => {
    const { status, info, error } = args[0] as {
      status: string;
      info?: { version: string };
      error?: string;
    };
    if (status === "update-available" && info) {
      toast.info(`새로운 업데이트가 있습니다: ${info.version}`, {
        action: {
          label: "다운로드",
          onClick: () => {
            ipcRenderer.invoke("download-update");
            toast.info("업데이트를 다운로드 중입니다...");
          },
        },
      });
    } else if (status === "update-downloaded" && info) {
      toast.success(`업데이트 다운로드가 완료되었습니다: ${info.version}`, {
        action: {
          label: "설치 및 재시작",
          onClick: () => {
            ipcRenderer.invoke("install-update");
          },
        },
      });
    } else if (status === "error" && error) {
      toast.error(`업데이트 오류: ${error}`);
    }
  });
});
</script>

<template>
  <RouterView />
  <Toaster rich-colors position="top-center" />
</template>
