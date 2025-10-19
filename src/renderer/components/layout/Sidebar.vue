<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { clearScrollPosition } from "@/composable/useScrollRestoration";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";

const uiStore = useUiStore();
const { isSidebarCollapsed } = storeToRefs(uiStore);
const { toggleSidebar } = uiStore;

const route = useRoute();
const router = useRouter();

const navItems = [
  {
    to: "/library",
    name: "Library",
    icon: "solar:folder-with-files-bold-duotone",
    label: "라이브러리",
  },
  {
    to: "/downloader",
    name: "Downloader",
    icon: "solar:download-square-bold-duotone",
    label: "다운로더",
  },
  {
    to: "/history",
    name: "History",
    icon: "solar:clock-circle-bold-duotone",
    label: "읽음 기록",
  },
  {
    to: "/statistics",
    name: "Statistics",
    icon: "solar:chart-square-bold-duotone",
    label: "통계",
  },
  {
    to: "/settings",
    name: "Settings",
    icon: "solar:settings-bold-duotone",
    label: "설정",
  },
];

// 네비게이션 클릭 핸들러
const handleNavClick = (item: typeof navItems[0]) => {
  // 현재 라우트와 같은 경로를 클릭한 경우
  if (route.path === item.to) {
    // 스크롤 위치 초기화
    clearScrollPosition(item.name);

    // 스크롤을 직접 맨 위로 올림
    const scrollContainers = [
      ".flex-grow.overflow-y-auto",
      ".flex-1.overflow-y-auto",
    ];

    for (const selector of scrollContainers) {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        element.scrollTop = 0;
        break;
      }
    }
  } else {
    // 다른 경로로 이동
    router.push(item.to);
  }
};
</script>

<template>
  <aside
    :class="
      cn(
        'bg-muted p-4 flex flex-col border-r transition-all duration-300 ease-in-out',
        isSidebarCollapsed ? 'items-center' : '',
      )
    "
    style="-webkit-app-region: drag"
  >
    <nav class="flex flex-col gap-2 flex-1">
      <TooltipProvider :delay-duration="0">
        <template v-for="item in navItems" :key="item.to">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                style="-webkit-app-region: no-drag"
                :class="
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
                    isSidebarCollapsed ? 'justify-center w-14 h-14' : '',
                    route.path === item.to ? 'bg-accent text-accent-foreground' : '',
                  )
                "
                @click="handleNavClick(item)"
              >
                <Icon :icon="item.icon" class="w-6 h-6" />
                <span v-if="!isSidebarCollapsed" class="whitespace-nowrap">
                  {{ item.label }}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ item.label }}</p>
            </TooltipContent>
          </Tooltip>
        </template>
      </TooltipProvider>
    </nav>

    <div class="mt-auto">
      <Button
        variant="outline"
        size="icon"
        class="w-14 h-14"
        style="-webkit-app-region: no-drag"
        @click="toggleSidebar"
      >
        <Icon
          :icon="
            isSidebarCollapsed
              ? 'solar:alt-arrow-right-bold-duotone'
              : 'solar:alt-arrow-left-bold-duotone'
          "
          class="w-6! h-6!"
        />
      </Button>
    </div>
  </aside>
</template>

<style scoped>
* {
  user-select: none;
}
</style>
