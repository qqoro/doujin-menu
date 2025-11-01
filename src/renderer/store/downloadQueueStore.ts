import { defineStore } from "pinia";
import { ref, computed, onMounted, onUnmounted } from "vue";
import * as api from "@/api";
import { ipcRenderer } from "@/api";
import type { DownloadQueueItem } from "../../types/ipc";

export const useDownloadQueueStore = defineStore("downloadQueue", () => {
  // 상태
  const queue = ref<DownloadQueueItem[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 계산된 속성
  const queueCount = computed(() => queue.value.length);
  const activeDownloads = computed(() =>
    queue.value.filter((item) => item.status === "downloading")
  );
  const pendingDownloads = computed(() =>
    queue.value.filter((item) => item.status === "pending")
  );
  const completedDownloads = computed(() =>
    queue.value.filter((item) => item.status === "completed")
  );
  const failedDownloads = computed(() =>
    queue.value.filter((item) => item.status === "failed")
  );
  const pausedDownloads = computed(() =>
    queue.value.filter((item) => item.status === "paused")
  );

  // 다운로드 중이거나 대기 중인 항목 개수
  const activeQueueCount = computed(
    () => activeDownloads.value.length + pendingDownloads.value.length
  );

  // 큐 불러오기
  const fetchQueue = async () => {
    try {
      isLoading.value = true;
      error.value = null;
      queue.value = await api.getDownloadQueue();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      console.error("큐 불러오기 실패:", err);
    } finally {
      isLoading.value = false;
    }
  };

  // 큐에 추가
  const addToQueue = async (params: {
    galleryId: number;
    galleryTitle: string;
    galleryArtist?: string;
    thumbnailUrl?: string;
    downloadPath: string;
  }) => {
    try {
      const newItem = await api.addToDownloadQueue(params);
      queue.value.push(newItem);
      return newItem;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("큐 추가 실패:", err);
      throw new Error(message);
    }
  };

  // 큐에서 제거
  const removeFromQueue = async (queueId: number) => {
    try {
      await api.removeFromDownloadQueue(queueId);
      queue.value = queue.value.filter((item) => item.id !== queueId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("큐 제거 실패:", err);
      throw new Error(message);
    }
  };

  // 다운로드 일시정지
  const pauseDownload = async (queueId: number) => {
    try {
      await api.pauseDownload(queueId);
      const item = queue.value.find((i) => i.id === queueId);
      if (item) {
        item.status = "paused";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("다운로드 일시정지 실패:", err);
      throw new Error(message);
    }
  };

  // 다운로드 재개
  const resumeDownload = async (queueId: number) => {
    try {
      await api.resumeDownload(queueId);
      const item = queue.value.find((i) => i.id === queueId);
      if (item) {
        item.status = "pending";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("다운로드 재개 실패:", err);
      throw new Error(message);
    }
  };

  // 다운로드 재시도
  const retryDownload = async (queueId: number) => {
    try {
      await api.retryDownload(queueId);
      const item = queue.value.find((i) => i.id === queueId);
      if (item) {
        item.status = "pending";
        item.progress = 0;
        item.downloaded_files = 0;
        item.error_message = undefined;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("다운로드 재시도 실패:", err);
      throw new Error(message);
    }
  };

  // 완료된 다운로드 모두 제거
  const clearCompleted = async () => {
    try {
      await api.clearCompletedDownloads();
      queue.value = queue.value.filter(
        (item) => item.status !== "completed"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("완료된 다운로드 제거 실패:", err);
      throw new Error(message);
    }
  };

  // IPC 이벤트 핸들러
  const handleQueueUpdate = () => {
    fetchQueue();
  };

  // 초기화 시 이벤트 리스너 등록
  let isInitialized = false;
  const initialize = () => {
    if (isInitialized) return;
    isInitialized = true;

    // 큐 업데이트 이벤트 수신
    ipcRenderer.on("download-queue-updated", handleQueueUpdate);

    // 초기 큐 로드
    fetchQueue();
  };

  // 정리
  const cleanup = () => {
    if (!isInitialized) return;
    ipcRenderer.off("download-queue-updated", handleQueueUpdate);
    isInitialized = false;
  };

  return {
    // 상태
    queue,
    isLoading,
    error,

    // 계산된 속성
    queueCount,
    activeDownloads,
    pendingDownloads,
    completedDownloads,
    failedDownloads,
    pausedDownloads,
    activeQueueCount,

    // 액션
    fetchQueue,
    addToQueue,
    removeFromQueue,
    pauseDownload,
    resumeDownload,
    retryDownload,
    clearCompleted,
    initialize,
    cleanup,
  };
});
