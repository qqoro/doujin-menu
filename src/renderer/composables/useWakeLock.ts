import { onUnmounted, watch, type Ref } from "vue";

/**
 * active가 true인 동안 화면이 꺼지지 않게 한다.
 * 탭이 백그라운드로 가면 브라우저가 잠금을 풀어 버리므로, 돌아왔을 때 다시 잡는다.
 */
export function useWakeLock(active: Ref<boolean>): void {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

  let sentinel: WakeLockSentinel | null = null;

  const acquire = async () => {
    if (sentinel || document.visibilityState !== "visible") return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        sentinel = null;
      });
    } catch {
      // 배터리 절약 모드 등으로 거부되면 화면 꺼짐을 막지 못할 뿐이다
    }
  };

  const release = async () => {
    const current = sentinel;
    sentinel = null;
    await current?.release().catch(() => {});
  };

  const onVisibilityChange = () => {
    if (active.value) void acquire();
  };

  watch(
    active,
    (value) => {
      if (value) void acquire();
      else void release();
    },
    { immediate: true },
  );
  document.addEventListener("visibilitychange", onVisibilityChange);

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    void release();
  });
}
