import type { AcceptableValue } from "reka-ui";
import { ref, watch } from "vue";

const STORAGE_KEY = "preview-view-mode";

export function usePreviewViewMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const viewMode = ref<"scroll" | "grid">(saved === "grid" ? "grid" : "scroll");

  watch(viewMode, (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
  });

  function setViewMode(mode: AcceptableValue | AcceptableValue[]) {
    if (mode === "scroll" || mode === "grid") viewMode.value = mode;
  }

  return { viewMode, setViewMode };
}
