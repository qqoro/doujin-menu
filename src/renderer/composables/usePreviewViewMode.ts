import { ref, watch } from "vue";

const STORAGE_KEY = "preview-view-mode";

export function usePreviewViewMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const viewMode = ref<"scroll" | "grid">(saved === "grid" ? "grid" : "scroll");
  const scrollToIndex = ref<number | null>(null);

  watch(viewMode, (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
  });

  function toggleViewMode() {
    viewMode.value = viewMode.value === "scroll" ? "grid" : "scroll";
  }

  function switchToScrollAtIndex(index: number) {
    viewMode.value = "scroll";
    scrollToIndex.value = index;
  }

  return { viewMode, scrollToIndex, toggleViewMode, switchToScrollAtIndex };
}
