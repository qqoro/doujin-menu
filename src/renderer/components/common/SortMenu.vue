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
import { toggledSortOrder } from "@/store/sortCycle";
import { Icon } from "@iconify/vue";

// 정렬 기준 드롭다운 + 오름/내림 토글이 맞붙은 버튼 그룹.
// 라이브러리와 시리즈가 같은 마크업을 각자 들고 있던 것을 하나로 모았다.
withDefaults(
  defineProps<{
    /** 표시 순서대로 넘긴다 */
    options: { value: string; label: string }[];
    sortBy: string;
    sortOrder: "asc" | "desc";
    /** 기준마다 순서가 정해져 있는 화면은 끈다 (예: 탐색의 개수순) */
    showOrder?: boolean;
  }>(),
  { showOrder: true },
);

const emit = defineEmits<{
  "update:sortBy": [value: string];
  "update:sortOrder": [value: "asc" | "desc"];
}>();
</script>

<template>
  <div class="inline-flex">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" :class="showOrder ? 'rounded-r-none' : ''">
          <Icon icon="solar:sort-bold-duotone" class="h-4 w-4" />
          정렬
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>정렬 기준</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          v-for="option in options"
          :key="option.value"
          @click="emit('update:sortBy', option.value)"
        >
          {{ option.label }}
          <Icon
            v-if="sortBy === option.value"
            icon="solar:check-circle-bold-duotone"
            class="ml-auto h-4 w-4"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <!-- 기본은 오름/내림 토글. 랜덤 정렬처럼 순서 개념이 없는 화면은
         이 자리를 다른 버튼으로 바꿔 쓴다 -->
    <slot v-if="showOrder" name="order">
      <Button
        variant="outline"
        class="rounded-l-none border-l-0"
        :aria-label="sortOrder === 'asc' ? '오름차순' : '내림차순'"
        @click="emit('update:sortOrder', toggledSortOrder(sortOrder))"
      >
        <Icon
          v-if="sortOrder === 'asc'"
          icon="solar:sort-from-bottom-to-top-bold-duotone"
          class="h-4 w-4"
        />
        <Icon
          v-else
          icon="solar:sort-from-top-to-bottom-bold-duotone"
          class="h-4 w-4"
        />
      </Button>
    </slot>
  </div>
</template>
