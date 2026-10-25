<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { toast } from "vue-sonner";

const props = defineProps<{ value: string; mono?: boolean }>();

const copy = async () => {
  await navigator.clipboard.writeText(props.value);
  toast.success("복사했습니다.");
};
</script>

<template>
  <div
    class="bg-muted flex min-w-0 items-center gap-1 rounded-md py-1 pr-1 pl-3"
  >
    <span
      class="min-w-0 flex-1 truncate text-sm"
      :class="mono && 'font-mono'"
      :title="value"
      >{{ value }}</span
    >
    <Button
      variant="ghost"
      size="icon"
      class="size-7"
      title="복사"
      @click="copy"
    >
      <Icon icon="solar:copy-bold-duotone" class="size-4" />
    </Button>
  </div>
</template>
