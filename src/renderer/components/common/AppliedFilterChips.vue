<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";

// 지금 걸려 있는 검색·필터를 칩으로 보여주고, 눌러서 풀 수 있게 한다.
//
// 조건이 앱을 껐다 켜도 유지되기 때문에, 무엇이 걸려 있는지 안 보이면
// "책이 사라졌다"는 오해를 산다. 자세한 배경은 lib/libraryFilters.ts 참고.
defineProps<{
  filters: { key: string; label: string }[];
}>();

const emit = defineEmits<{
  clear: [key: string];
  clearAll: [];
}>();
</script>

<template>
  <div
    v-if="filters.length > 0"
    class="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
  >
    <span class="shrink-0">필터 적용중</span>
    <Badge
      v-for="filter in filters"
      :key="filter.key"
      variant="secondary"
      role="button"
      class="max-w-xs cursor-pointer gap-1"
      :title="`${filter.label} 해제`"
      @click="emit('clear', filter.key)"
    >
      <span class="truncate">{{ filter.label }}</span>
      <Icon
        icon="solar:close-circle-bold-duotone"
        class="h-3.5 w-3.5 shrink-0"
      />
    </Badge>
    <Button variant="ghost" size="sm" class="h-7" @click="emit('clearAll')">
      전체 해제
    </Button>
  </div>
</template>
