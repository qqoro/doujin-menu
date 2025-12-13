<script setup lang="ts">
import { getAppVersion, ipcRenderer, isFullscreen } from "@/api";
import { useWindowEvent } from "@/composable/useWindowEvent";
import { cn, hasOpenDialog } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import AppLock from "../common/AppLock.vue";
import ChangelogDialog from "../common/ChangelogDialog.vue";
import Header from "./Header.vue";
import Sidebar from "./Sidebar.vue";

const uiStore = useUiStore();
const { isSidebarCollapsed } = storeToRefs(uiStore);

const open = ref(false);

const handleKeyDown = async (event: KeyboardEvent) => {
  if (event.key === "Escape" && (await isFullscreen())) {
    ipcRenderer.send("set-fullscreen-window", false);
    return;
  }

  if (event.key === "Escape") {
    // 열려있는 다이얼로그나 오버레이가 있는지 확인
    if (hasOpenDialog()) {
      // 다이얼로그가 열려있으면 기본 동작(다이얼로그 닫기)만 수행하고 창 최소화는 하지 않음
      return;
    }

    ipcRenderer.send("minimize-window");
    return;
  }

  if (event.key === "F11") {
    ipcRenderer.send("fullscreen-toggle-window");
    return;
  }
};

useWindowEvent("keydown", handleKeyDown);

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  const version = await getAppVersion();
  if (config.lastSeenChangelog !== version) {
    open.value = true;
  }
});
</script>

<template>
  <div
    :class="
      cn(
        'bg-background grid h-screen grid-rows-[auto_1fr] transition-[grid-template-columns] duration-300 ease-in-out',
        isSidebarCollapsed ? 'grid-cols-[5.5rem_1fr]' : 'grid-cols-[14rem_1fr]',
      )
    "
  >
    <Header class="col-span-2" />
    <Sidebar class="row-start-2" />
    <AppLock v-if="uiStore.isLocked" />
    <main
      v-else
      class="bg-background col-start-2 row-start-2 overflow-y-auto p-6"
    >
      <router-view v-slot="{ Component }">
        <keep-alive :include="['Library', 'Downloader', 'History']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
    <ChangelogDialog v-model:open="open" />
  </div>
</template>
