<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@iconify/vue";
import { useQuery } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import { getPresets } from "../../api";

defineProps<{ modelValue: string }>();
const emit = defineEmits(["update:modelValue", "applyPreset"]);

const router = useRouter();

const { data: presets } = useQuery({
  queryKey: ["presets"],
  queryFn: getPresets,
});

const handleApplyPreset = (presetQuery: string) => {
  emit("update:modelValue", presetQuery);
  emit("applyPreset", presetQuery); // 추가적인 이벤트 발생
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="icon">
        <Icon icon="solar:bookmark-bold-duotone" class="w-5 h-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-56">
      <DropdownMenuLabel>프리셋</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <template v-if="presets && presets.length > 0">
        <DropdownMenuItem
          v-for="preset in presets"
          :key="preset.id"
          @click="handleApplyPreset(preset.query)"
        >
          {{ preset.name }}
        </DropdownMenuItem>
      </template>
      <template v-else>
        <DropdownMenuItem disabled> (없음) </DropdownMenuItem>
      </template>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="router.push('/settings?tab=presets')">
        프리셋 관리...
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
