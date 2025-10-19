<script setup lang="ts">
import { getAppVersion, ipcRenderer } from "@/api";
import { useWindowEvent } from "@/composable/useWindowEvent";
import { cn } from "@/lib/utils";
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

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    ipcRenderer.send("minimize-window");
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
        'h-screen grid grid-rows-[auto_1fr] bg-background transition-[grid-template-columns] duration-300 ease-in-out',
        isSidebarCollapsed ? 'grid-cols-[5.5rem_1fr]' : 'grid-cols-[14rem_1fr]',
      )
    "
  >
    <Header class="col-span-2" />
    <Sidebar class="row-start-2" />
    <AppLock v-if="uiStore.isLocked" />
    <main
      v-else
      class="row-start-2 col-start-2 overflow-y-auto p-6 bg-background"
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
