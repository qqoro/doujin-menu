<script setup lang="ts">
import { getAppVersion, ipcRenderer } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changelogData } from "@/lib/changelog";
import { useQuery } from "@tanstack/vue-query";
import { onUnmounted } from "vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const { data: version } = useQuery({
  queryKey: ["version"],
  queryFn: async () => {
    return getAppVersion();
  },
});

onUnmounted(() => {
  if (!version.value) {
    return;
  }

  ipcRenderer.invoke("set-config", {
    key: "lastSeenChangelog",
    value: version.value,
  });
});
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>새로운 변경 사항</DialogTitle>
        <DialogDescription>
          동인메뉴판이 업데이트되었습니다. 다음은 새로운 기능 및 변경
          사항입니다.
        </DialogDescription>
      </DialogHeader>
      <div
        class="flex flex-col gap-6 h-96 w-full rounded-md border p-4 overflow-y-auto"
      >
        <div
          v-for="changelog in changelogData"
          :key="changelog.version"
          class="flex flex-col gap-2"
        >
          <h1 class="border-b pb-1 mb-2 text-xl">v{{ changelog.version }}</h1>
          <div v-for="(change, index) in changelog.changes" :key="index">
            <h3 class="font-semibold">{{ change.title }}</h3>
            <ul
              class="mt-2 list-disc space-y-1 pl-6 text-sm text-muted-foreground"
            >
              <li v-for="(item, itemIndex) in change.items" :key="itemIndex">
                {{ item }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button @click="emit('update:open', false)">확인</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
