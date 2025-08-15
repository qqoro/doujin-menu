import { onMounted, onUnmounted } from "vue";

export const useWindowEvent = <K extends keyof WindowEventMap>(
  ...args: Parameters<typeof window.addEventListener<K>>
) => {
  onMounted(() => {
    window.addEventListener(args[0], args[1], args[2]);
  });
  onUnmounted(() => {
    window.removeEventListener(args[0], args[1], args[2]);
  });
};
