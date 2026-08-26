import * as api from "@/api";
import { ipcRenderer } from "@/api";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SubscriptionStatus } from "../../types/ipc";

/**
 * 구독 신작 상태.
 *
 * 초기화는 Layout에서 한다. Downloader에서 하면 다운로더를 한 번도 안 연
 * 세션에서 사이드바 빨간 점이 뜨지 않는다.
 */
export const useSubscriptionStore = defineStore("subscription", () => {
  const newCount = ref(0);
  const subscriptionCount = ref(0);
  const feedTotal = ref(0);
  const lastCheckedAt = ref<string | null>(null);

  /** 사이드바·탭의 빨간 점 */
  const hasUnseen = computed(() => newCount.value > 0);

  const applyStatus = (status: SubscriptionStatus) => {
    newCount.value = status.newCount;
    subscriptionCount.value = status.subscriptionCount;
    feedTotal.value = status.feedTotal;
    lastCheckedAt.value = status.lastCheckedAt;
  };

  const refreshStatus = async () => {
    try {
      applyStatus(await api.getSubscriptionStatus());
    } catch (err) {
      console.error("구독 상태 불러오기 실패:", err);
    }
  };

  /**
   * 빨간 점을 즉시 끈다.
   *
   * 서버 브로드캐스트를 기다리면 탭에 들어간 뒤에도 점이 잠깐 남는다.
   */
  const markSeenLocally = () => {
    newCount.value = 0;
  };

  // subscriptions-updated는 payload 없는 신호다. 받으면 당겨온다
  // (books-updated 등 기존 채널과 같은 관례)
  const handleUpdated = () => {
    void refreshStatus();
  };

  let isInitialized = false;
  const initialize = () => {
    if (isInitialized) return;
    isInitialized = true;

    ipcRenderer.on("subscriptions-updated", handleUpdated);
    void refreshStatus();
  };

  const cleanup = () => {
    if (!isInitialized) return;
    ipcRenderer.off("subscriptions-updated", handleUpdated);
    isInitialized = false;
  };

  return {
    newCount,
    subscriptionCount,
    feedTotal,
    lastCheckedAt,
    hasUnseen,
    refreshStatus,
    markSeenLocally,
    initialize,
    cleanup,
  };
});
