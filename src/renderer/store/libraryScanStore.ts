import { ipcRenderer } from "@/api";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { LibraryScanProgress } from "../../types/ipc";

// 완료 표시가 자동으로 닫히기까지의 시간. 남은 시간 진행바도 같은 값을 쓴다.
export const AUTO_DISMISS_DELAY = 5000;

export const useLibraryScanStore = defineStore("libraryScan", () => {
  // 상태
  const isScanning = ref(false);
  const scanProgress = ref<LibraryScanProgress | null>(null);
  // 완료될 때마다 증가. 진행바 애니메이션을 다시 시작시키는 key로 쓰인다.
  const completionId = ref(0);

  let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  const clearAutoDismissTimer = () => {
    if (autoDismissTimer === null) return;
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  };

  // 계산된 속성
  const progressPercent = computed(() => scanProgress.value?.progress ?? 0);

  // 단계별 메시지
  const phaseMessage = computed(() => {
    if (!scanProgress.value) return "";

    const phase = scanProgress.value.phase;
    switch (phase) {
      case "counting":
        return "파일 수 확인 중...";
      case "scanning":
        return "스캔 중...";
      case "thumbnails":
        return "썸네일 생성 중...";
      case "series":
        return "시리즈 감지 중...";
      case "completed":
        return "완료";
      default:
        return "";
    }
  });

  // 스캔 통계 요약
  const statsSummary = computed(() => {
    if (!scanProgress.value) return null;

    const { addedCount, updatedCount, deletedCount } = scanProgress.value;
    const parts: string[] = [];

    if (addedCount > 0) parts.push(`추가: ${addedCount}`);
    if (updatedCount > 0) parts.push(`업데이트: ${updatedCount}`);
    if (deletedCount > 0) parts.push(`삭제: ${deletedCount}`);

    return parts.length > 0 ? parts.join(" | ") : null;
  });

  // IPC 이벤트 핸들러
  const handleProgressUpdate = (
    _event: Electron.IpcRendererEvent,
    progress: LibraryScanProgress,
  ) => {
    clearAutoDismissTimer();
    scanProgress.value = progress;

    // 완료 단계가 아니면 스캔 중으로 표시
    if (progress.phase === "completed") {
      isScanning.value = false;
      completionId.value += 1;
      autoDismissTimer = setTimeout(resetScanState, AUTO_DISMISS_DELAY);
    } else {
      isScanning.value = true;
    }
  };

  // 초기화 시 이벤트 리스너 등록
  let isInitialized = false;
  const initialize = () => {
    if (isInitialized) return;
    isInitialized = true;

    // 스캔 진행률 이벤트 수신
    ipcRenderer.on("library-scan-progress", handleProgressUpdate);
  };

  // 정리
  const cleanup = () => {
    if (!isInitialized) return;
    clearAutoDismissTimer();
    ipcRenderer.off("library-scan-progress", handleProgressUpdate);
    isInitialized = false;
  };

  // 수동으로 스캔 상태 리셋
  const resetScanState = () => {
    clearAutoDismissTimer();
    isScanning.value = false;
    scanProgress.value = null;
  };

  return {
    // 상태
    isScanning,
    scanProgress,
    completionId,

    // 계산된 속성
    progressPercent,
    phaseMessage,
    statsSummary,

    // 액션
    initialize,
    cleanup,
    resetScanState,
  };
});
