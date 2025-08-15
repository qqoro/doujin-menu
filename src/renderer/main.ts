import "@/assets/style.css";
import "@/assets/tailwind.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "vue-sonner/style.css";

import { VueQueryPlugin } from "@tanstack/vue-query";
import { useColorMode } from "@vueuse/core";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { ipcRenderer } from "./api";
import App from "./App.vue";
import { router } from "./router";

const pinia = createPinia();
const app = createApp(App);

(async () => {
  const config = await ipcRenderer.invoke("get-config");
  const initialTheme = config.theme || "auto";
  useColorMode({ initialValue: initialTheme });

  app.use(router).use(pinia).use(VueQueryPlugin).mount("#app");
})();
