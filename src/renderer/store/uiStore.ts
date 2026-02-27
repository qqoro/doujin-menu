import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useUiStore = defineStore("ui", () => {
  // localStorage에서 초기 값을 가져오거나 false를 기본값으로 사용
  const isSidebarCollapsed = ref(
    JSON.parse(localStorage.getItem("isSidebarCollapsed") || "false"),
  );
  const isLocked = ref(false);
  const screenRotation = ref<0 | 90 | 180 | 270>(0);

  // 상태를 토글하는 액션
  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }

  function setLocked(locked: boolean) {
    isLocked.value = locked;
  }

  function setScreenRotation(rotation: 0 | 90 | 180 | 270) {
    screenRotation.value = rotation;
  }

  // 상태가 변경될 때마다 localStorage에 저장
  watch(isSidebarCollapsed, (newValue) => {
    localStorage.setItem("isSidebarCollapsed", JSON.stringify(newValue));
  });

  // 화면 회전 상태도 localStorage에 저장
  watch(screenRotation, (newValue) => {
    localStorage.setItem("screenRotation", String(newValue));
  });

  return {
    isSidebarCollapsed,
    toggleSidebar,
    isLocked,
    setLocked,
    screenRotation,
    setScreenRotation,
  };
});
