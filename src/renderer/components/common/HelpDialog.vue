<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icon } from "@iconify/vue";

const props = defineProps<{
  title: string;
  description: string;
}>();

const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();
</script>

<template>
  <Dialog @update:open="emit('update:open', $event)">
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <!--
      내용이 화면보다 길어지므로 창 높이를 묶고 본문만 스크롤시킨다.
      기본 grid로는 칸이 내용 높이만큼 버텨 스크롤이 안 생기므로 flex로 바꾼다
    -->
    <DialogContent class="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Icon icon="solar:help-bold-duotone" class="h-6 w-6" />
          {{ props.title }}
        </DialogTitle>
        <DialogDescription>
          {{ props.description }}
        </DialogDescription>
      </DialogHeader>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        <slot />
      </div>
    </DialogContent>
  </Dialog>
</template>
