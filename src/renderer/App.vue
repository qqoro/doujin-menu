<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner";
import { useKeybindings } from "@/composable/useKeybindings";
import { useTheme } from "@/composable/useTheme";
import { useKeybindingStore } from "@/store/keybindingStore";
import { useUiStore } from "@/store/uiStore";
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import { toast } from "vue-sonner";
import { ipcRenderer } from "./api";

// 앱 전역 단축키 등록 (새로고침, 창 닫기)
useKeybindings("global", {
  "global:refresh": () => {
    location.reload();
  },
  "global:close-window": () => {
    window.close();
  },
});

const keybindingStore = useKeybindingStore();
const uiStore = useUiStore();
const { initializeTheme } = useTheme();

onMounted(async () => {
  // 테마 초기화
  await initializeTheme();

  // 앱 설정 로드 (단축키 오버라이드, 화면 회전 등)
  const config = await ipcRenderer.invoke("get-config");

  // 저장된 단축키 오버라이드 적용
  if (config.keybindingOverrides) {
    keybindingStore.loadOverrides(config.keybindingOverrides);
  }

  // 화면 회전 설정 로드
  const savedRotation = (config.screenRotation as 0 | 90 | 180 | 270) || 0;
  uiStore.setScreenRotation(savedRotation);

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
