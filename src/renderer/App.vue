<script setup lang="ts">
import ConnectionBanner from "@/components/common/ConnectionBanner.vue";
import { Toaster } from "@/components/ui/sonner";
import { IS_REMOTE } from "@/lib/runtime";
import { useKeybindings } from "@/composables/useKeybindings";
import { useTheme } from "@/composables/useTheme";
import type { KeybindingOverride } from "@/lib/keybindings/types";
import { useKeybindingStore } from "@/store/keybindingStore";
import { useUiStore } from "@/store/uiStore";
import { onMounted } from "vue";
import { RouterView, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { ipcRenderer } from "./api";

const router = useRouter();

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
    keybindingStore.loadOverrides(
      config.keybindingOverrides as KeybindingOverride[],
    );
  }

  // 화면 회전 설정 로드
  const savedRotation = (config.screenRotation as 0 | 90 | 180 | 270) || 0;
  uiStore.setScreenRotation(savedRotation);

  const shouldBeLocked = await ipcRenderer.invoke("get-initial-lock-status");
  if (shouldBeLocked) {
    uiStore.setLocked(true);
  }

  ipcRenderer.on(
    "update-status",
    (_event, { status, info, progressObj, error }) => {
      if (status === "update-available" && info) {
        // 수동 확인을 반복해도 쌓이지 않도록 같은 id로 교체
        toast.info(`새 버전 v${info.version}을 사용할 수 있습니다`, {
          id: "update-available",
          description: "설치하기를 누르면 다운로드 후 자동으로 재시작합니다",
          duration: Infinity,
          action: {
            label: "설치하기",
            onClick: () => {
              ipcRenderer.invoke("download-update");
            },
          },
        });
      } else if (status === "update-available-portable" && info) {
        toast.info(`새 버전 v${info.version}을 사용할 수 있습니다`, {
          id: "update-available",
          description: "포터블 버전은 자동 업데이트를 지원하지 않습니다",
          duration: Infinity,
          action: {
            label: "다운로드 페이지",
            onClick: () => {
              // 메인이 해당 버전의 릴리즈 페이지를 연다
              ipcRenderer.invoke("download-update");
            },
          },
        });
      } else if (status === "download-progress" && progressObj) {
        toast.info(
          `업데이트 다운로드 중... ${progressObj.percent.toFixed(0)}%`,
          { id: "update-download", duration: Infinity },
        );
      } else if (status === "update-downloaded" && info) {
        toast.dismiss("update-download");
        toast.success(`v${info.version} 다운로드 완료! 앱을 재시작합니다.`, {
          duration: 2000,
        });
        setTimeout(() => {
          ipcRenderer.invoke("install-update");
        }, 2000);
      } else if (status === "error" && error) {
        toast.dismiss("update-download");
        toast.error(`업데이트 오류: ${error}`);
      }
    },
  );

  // 구독 신작 토스트. 메인이 메인 창에만 보내므로 뷰어 창에서는 뜨지 않는다
  ipcRenderer.on(
    "subscription-new-found",
    (_event, { subscriptionCount, newCount }) => {
      toast.info(`구독 ${subscriptionCount}건에 신작 ${newCount}개`, {
        action: {
          label: "보러가기",
          onClick: () => {
            router.push("/downloader");
          },
        },
      });
    },
  );

  // 모든 리스너 등록이 끝난 뒤 준비 신호 전송.
  // main은 이 신호를 받은 이후에만 자동 스캔 결과를 보내므로 결과 이벤트를 유실하지 않는다.
  // 구독 폴링도 이 신호를 기준으로 시작한다 (리스너 등록 전에 보내면 토스트가 사라진다).
  ipcRenderer.send("renderer-ready");
});
</script>

<template>
  <RouterView />
  <ConnectionBanner v-if="IS_REMOTE" />
  <Toaster rich-colors position="top-center" />
</template>
