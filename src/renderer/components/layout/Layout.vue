<script setup lang="ts">
import { ipcRenderer } from "@/api";
import { useWindowEvent } from "@/composable/useWindowEvent";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { storeToRefs } from "pinia";
import Header from "./Header.vue";
import Sidebar from "./Sidebar.vue";

const uiStore = useUiStore();
const { isSidebarCollapsed } = storeToRefs(uiStore);

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    ipcRenderer.send("minimize-window");
  }
};

useWindowEvent("keydown", handleKeyDown);
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
    <main class="row-start-2 col-start-2 overflow-y-auto p-6 bg-background">
      <router-view />
    </main>
  </div>
</template>
