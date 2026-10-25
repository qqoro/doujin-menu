import { detectInstallMode, type InstallMode } from "@/lib/pwaInstall";
import { IS_REMOTE } from "@/lib/runtime";
import { computed, ref, shallowRef, type ComputedRef } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null);
const installed = ref(false);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** 크롬은 이 이벤트를 페이지 로드 직후 한 번만 보내므로 마운트 전에 등록한다 */
export function listenForInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    // 크롬이 자동으로 띄우는 설치 배너 대신 상단 바 버튼으로만 띄운다
    event.preventDefault();
    deferredPrompt.value = event as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt.value = null;
    installed.value = true;
  });
}

export function usePwaInstall(): {
  mode: ComputedRef<InstallMode>;
  install(): Promise<void>;
} {
  const mode = computed(() =>
    installed.value
      ? null
      : detectInstallMode({
          remote: IS_REMOTE,
          secure: window.isSecureContext,
          standalone: isStandalone(),
          userAgent: navigator.userAgent,
          hasPrompt: deferredPrompt.value !== null,
        }),
  );

  const install = async () => {
    const event = deferredPrompt.value;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // 한 번 쓴 이벤트는 다시 prompt()할 수 없다
    deferredPrompt.value = null;
    if (outcome === "accepted") installed.value = true;
  };

  return { mode, install };
}
