import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useUiStore = defineStore("ui", () => {
  // localStorage에서 초기 값을 가져오거나 false를 기본값으로 사용
  const isSidebarCollapsed = ref(
    JSON.parse(localStorage.getItem("isSidebarCollapsed") || "false"),
  );
  const isLocked = ref(false);

  // 상태를 토글하는 액션
  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }

  function setLocked(locked: boolean) {
    isLocked.value = locked;
  }

  // 상태가 변경될 때마다 localStorage에 저장
  watch(isSidebarCollapsed, (newValue) => {
    localStorage.setItem("isSidebarCollapsed", JSON.stringify(newValue));
  });

  return {
    isSidebarCollapsed,
    toggleSidebar,
    isLocked,
    setLocked,
  };
});
