<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";

/**
 * 시리즈 영역의 삭제 버튼. 표지 위에서도 보이도록 평소에도 불투명 배경을 깐다.
 * `label`이 있으면 글자가 붙은 버튼, 없으면 아이콘 버튼이다.
 */
defineProps<{ label?: string }>();
</script>

<template>
  <Button
    :size="label ? 'sm' : 'icon-sm'"
    variant="secondary"
    class="text-destructive hover:bg-destructive hover:text-destructive-foreground"
  >
    <Icon icon="solar:trash-bin-minimalistic-bold-duotone" class="h-4 w-4" />
    {{ label }}
  </Button>
</template>
