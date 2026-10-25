import "@/assets/style.css";
import "@/assets/tailwind.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "vue-sonner/style.css";

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useColorMode } from "@vueuse/core";
import { createPinia } from "pinia";
import { createApp } from "vue";
import {
  ipcRenderer,
  WEB_CLIENT_ID,
  WEB_RECONNECTED_EVENT,
  WEB_UNAUTHORIZED_EVENT,
} from "./api";
import { listenForInstallPrompt } from "./composables/usePwaInstall";
import { hasSession, requestPairing, takePairCode } from "./lib/pairing";
import { IS_REMOTE } from "./lib/runtime";
import { WebUnauthorizedError } from "./lib/webIpc";
import App from "./App.vue";
import PairingScreen from "./components/pages/PairingScreen.vue";
import { router } from "./router";

const pinia = createPinia();
const queryClient = new QueryClient();
const app = createApp(App);

// QR로 들어왔으면 코드부터 쓴다. 실패 이유는 코드 화면에 보여 준다
const pairFromUrl = async (): Promise<string | undefined> => {
  const code = takePairCode(window.location.href, (url) =>
    history.replaceState(history.state, "", url),
  );
  if (!code) return undefined;
  const fetchFn = window.fetch.bind(window);
  if (await hasSession(fetchFn)) return undefined;
  const result = await requestPairing(fetchFn, WEB_CLIENT_ID, code);
  return result.ok ? undefined : result.message;
};

(async () => {
  const pairError = IS_REMOTE ? await pairFromUrl() : undefined;

  let config;
  try {
    config = await ipcRenderer.invoke("get-config");
  } catch (error) {
    if (!(error instanceof WebUnauthorizedError)) throw error;
    useColorMode({ initialValue: "auto" });
    createApp(PairingScreen, { initialError: pairError }).mount("#app");
    return;
  }

  const initialTheme =
    (config.theme as string | undefined) || ("auto" as const);
  useColorMode({ initialValue: initialTheme });

  app.use(router).use(pinia).use(VueQueryPlugin, { queryClient }).mount("#app");

  if (IS_REMOTE) {
    window.addEventListener(WEB_UNAUTHORIZED_EVENT, () => location.reload());
  }
})();

if (IS_REMOTE) {
  // 이벤트 연결이 끊긴 동안 PC에서 바뀐 내용을 다시 불러온다
  window.addEventListener(WEB_RECONNECTED_EVENT, () => {
    void queryClient.invalidateQueries();
  });
  listenForInstallPrompt();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}
