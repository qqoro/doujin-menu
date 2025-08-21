<template>
  <div class="flex items-center justify-between gap-4">
    <div class="flex flex-col gap-1 items-start grow">
      <Label :for="labelFor">{{ title }}</Label>
      <p v-if="subtitle" class="text-sm text-muted-foreground">
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
