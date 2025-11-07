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
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Icon icon="solar:help-bold-duotone" class="h-6 w-6" />
          {{ props.title }}
        </DialogTitle>
        <DialogDescription>
          {{ props.description }}
        </DialogDescription>
      </DialogHeader>

      <div>
        <slot />
      </div>
    </DialogContent>
  </Dialog>
</template>
