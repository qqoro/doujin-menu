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

  // 라이브러리 랜덤 정렬용 시드([0, 2^30) 정수): 컴포넌트가 아닌 스토어에 두어
  // 뷰어(/viewer, Layout 밖 라우트) 왕복으로 Library가 언마운트돼도 순서가 유지된다.
  // 저장하지 않으므로 앱 재시작 시 새로 섞인다.
  const libraryRandomSeed = ref<number>(Math.floor(Math.random() * 2 ** 30));

  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }

  // 랜덤 정렬 순서 재셔플 (라이브러리의 '다시 섞기' 버튼에서 호출)
  function reshuffleLibraryRandomSeed() {
    libraryRandomSeed.value = Math.floor(Math.random() * 2 ** 30);
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
    libraryRandomSeed,
    reshuffleLibraryRandomSeed,
  };
});
