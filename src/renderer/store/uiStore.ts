import { defineStore } from "pinia";
import { ref, watch } from "vue";

// 썸네일 줌 기본값 및 범위
const THUMBNAIL_ZOOM_DEFAULT = 1.0;
const THUMBNAIL_ZOOM_MIN = 0.4;
const THUMBNAIL_ZOOM_MAX = 1.5;
const THUMBNAIL_ZOOM_STEP = 0.1;

export const useUiStore = defineStore("ui", () => {
  const isSidebarCollapsed = ref(
    JSON.parse(localStorage.getItem("isSidebarCollapsed") || "false"),
  );
  const isLocked = ref(false);
  const screenRotation = ref<0 | 90 | 180 | 270>(0);

  // 썸네일 줌 배율
  const thumbnailZoom = ref(
    Number(localStorage.getItem("thumbnailZoom")) || THUMBNAIL_ZOOM_DEFAULT,
  );

  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }

  function setLocked(locked: boolean) {
    isLocked.value = locked;
  }

  function setScreenRotation(rotation: 0 | 90 | 180 | 270) {
    screenRotation.value = rotation;
  }

  // 썸네일 줌 조절 (줌 인 = 크게, 줌 아웃 = 작게/밀도↑)
  function setThumbnailZoom(value: number) {
    thumbnailZoom.value =
      Math.round(
        Math.max(THUMBNAIL_ZOOM_MIN, Math.min(THUMBNAIL_ZOOM_MAX, value)) * 10,
      ) / 10;
  }

  function zoomIn() {
    setThumbnailZoom(thumbnailZoom.value + THUMBNAIL_ZOOM_STEP);
  }

  function zoomOut() {
    setThumbnailZoom(thumbnailZoom.value - THUMBNAIL_ZOOM_STEP);
  }

  watch(isSidebarCollapsed, (newValue) => {
    localStorage.setItem("isSidebarCollapsed", JSON.stringify(newValue));
  });

  watch(screenRotation, (newValue) => {
    localStorage.setItem("screenRotation", String(newValue));
  });

  watch(thumbnailZoom, (newValue) => {
    localStorage.setItem("thumbnailZoom", String(newValue));
  });

  return {
    isSidebarCollapsed,
    toggleSidebar,
    isLocked,
    setLocked,
    screenRotation,
    setScreenRotation,
    thumbnailZoom,
    setThumbnailZoom,
    zoomIn,
    zoomOut,
  };
});
