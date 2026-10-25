<script setup lang="ts">
import { useConnectionBanner } from "@/composables/useWebConnection";
import { Icon } from "@iconify/vue";

const visible = useConnectionBanner();
</script>

<template>
  <div
    v-if="visible"
    role="status"
    class="bg-destructive text-destructive-foreground fixed inset-x-0 top-[env(safe-area-inset-top)] z-[100] flex items-center justify-center gap-2 px-4 py-1.5 text-sm shadow-md"
  >
    <Icon
      icon="solar:refresh-bold-duotone"
      class="size-4 shrink-0 animate-spin"
    />
    <span class="min-w-0">PC 앱과 연결이 끊겼습니다. 다시 연결하는 중…</span>
  </div>
</template>
