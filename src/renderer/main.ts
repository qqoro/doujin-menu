import "@/assets/style.css";
import "@/assets/tailwind.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "vue-sonner/style.css";

import log from "electron-log";

const mainStartTime = performance.now();
const logTime = (label: string) => {
  log.log(`[⏱️ ${(performance.now() - mainStartTime).toFixed(0)}ms] ${label}`);
};

logTime("[main.ts] 모듈 로드 시작");

import { VueQueryPlugin } from "@tanstack/vue-query";
import { useColorMode } from "@vueuse/core";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { ipcRenderer } from "./api";
import App from "./App.vue";
import { router } from "./router";

logTime("[main.ts] import 완료");

const pinia = createPinia();
const app = createApp(App);

logTime("[main.ts] createApp 완료");

(async () => {
  logTime("[main.ts] async 진입");

  logTime("[main.ts] get-config 시작");
  const config = await ipcRenderer.invoke("get-config");
  logTime("[main.ts] get-config 완료");

  const initialTheme =
    (config.theme as string | undefined) || ("auto" as const);
  useColorMode({ initialValue: initialTheme });

  logTime("[main.ts] mount 시작");
  app.use(router).use(pinia).use(VueQueryPlugin).mount("#app");
  logTime("[main.ts] mount 완료");
})();
