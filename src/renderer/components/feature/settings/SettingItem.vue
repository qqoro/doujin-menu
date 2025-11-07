<template>
  <div class="flex items-center justify-between gap-4">
    <div class="flex grow flex-col items-start gap-1">
      <Label :for="labelFor">{{ title }}</Label>
      <slot name="subtitle" />
      <p
        v-if="subtitle && !$slots.subtitle"
        class="text-muted-foreground text-sm"
      >
        {{ subtitle }}
      </p>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { Label } from "@/components/ui/label";

defineProps<{
  labelFor?: string;
  title: string;
  subtitle?: string;
}>();
</script>
