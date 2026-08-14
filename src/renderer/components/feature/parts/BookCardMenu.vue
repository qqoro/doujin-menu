<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { BookMenuItem } from "@/lib/bookCard";
import { Icon } from "@iconify/vue";

/**
 * 우클릭 메뉴.
 *
 * 항목은 `useBookCard`의 `menuItems`가 만들고 여기서는 그리기만 한다. 같은
 * 배열을 `BookCardMenuButton`(⋮ 드롭다운)도 그린다.
 */
defineProps<{ items: BookMenuItem[] }>();
</script>

<template>
  <ContextMenuContent>
    <template v-for="item in items" :key="item.key">
      <ContextMenuSeparator v-if="item.separatorBefore" />
      <ContextMenuItem @click="item.action()">
        <Icon :icon="item.icon" class="h-4 w-4" :class="item.iconClass" />
        {{ item.label }}
      </ContextMenuItem>
    </template>
  </ContextMenuContent>
</template>
