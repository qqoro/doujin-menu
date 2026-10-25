<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import Sidebar from "./Sidebar.vue";

const open = defineModel<boolean>("open", { required: true });
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        class="bg-muted fixed inset-y-0 left-0 z-50 flex w-64 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-lg"
        :aria-describedby="undefined"
      >
        <DialogTitle class="sr-only">메뉴</DialogTitle>
        <Sidebar expanded class="h-full" @navigate="open = false" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
