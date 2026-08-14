<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BookMenuItem } from "@/lib/bookCard";
import { Icon } from "@iconify/vue";

/**
 * ⋮ 메뉴 버튼.
 *
 * 우클릭 메뉴와 **같은 `items` 배열**을 그린다. 우클릭은 발견되지 않는
 * 기능이라 눈에 보이는 입구를 하나 둔다.
 */
withDefaults(
  defineProps<{
    items: BookMenuItem[];
    /** 버튼 모양. 그리드는 아이콘만, 리스트는 문구를 단다 */
    variant?: "icon" | "labeled";
  }>(),
  { variant: "icon" },
);
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <!-- 카드 클릭(뷰어 열기)으로 번지면 안 된다 -->
      <Button
        v-if="variant === 'icon'"
        size="icon-sm"
        variant="secondary"
        title="더보기"
        @click.stop
      >
        <Icon icon="solar:menu-dots-bold" class="h-4 w-4" />
      </Button>
      <Button v-else size="sm" variant="outline" @click.stop>
        <Icon icon="solar:menu-dots-bold" class="h-4 w-4" />
        더보기
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" @click.stop>
      <template v-for="item in items" :key="item.key">
        <DropdownMenuSeparator v-if="item.separatorBefore" />
        <DropdownMenuItem @click="item.action()">
          <Icon :icon="item.icon" class="h-4 w-4" :class="item.iconClass" />
          {{ item.label }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
