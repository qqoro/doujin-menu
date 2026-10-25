import { ref, watch, type Ref } from "vue";

// 폰이 잠들었다 깨는 짧은 끊김에는 띠가 깜빡이지 않게 한다
export const BANNER_DELAY_MS = 3000;

/** 원격 화면과 PC 앱 사이의 이벤트 연결 상태. api.ts가 갱신한다 */
export const webConnected = ref(true);

export function useConnectionBanner(): Ref<boolean> {
  const visible = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    webConnected,
    (connected) => {
      clearTimeout(timer);
      if (connected) {
        visible.value = false;
        return;
      }
      timer = setTimeout(() => {
        visible.value = true;
      }, BANNER_DELAY_MS);
    },
    { immediate: true },
  );

  return visible;
}
