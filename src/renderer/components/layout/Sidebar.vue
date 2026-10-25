<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ipcRenderer } from "@/api";
import { clearScrollPosition } from "@/composables/useScrollRestoration";
import { IS_REMOTE } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps<{
  /** 휴대폰 서랍처럼 접기 상태와 상관없이 항상 펼쳐서 보여 줄 때 */
  expanded?: boolean;
}>();
const emit = defineEmits<{ navigate: [] }>();

const subscriptionStore = useSubscriptionStore();
const uiStore = useUiStore();
const { isSidebarCollapsed } = storeToRefs(uiStore);
const { toggleSidebar } = uiStore;
const collapsed = computed(() => !props.expanded && isSidebarCollapsed.value);

const route = useRoute();
const router = useRouter();

type NavItem = {
  to: string;
  name: string;
  icon: string;
  label: string;
  pcOnly?: boolean;
};

// Tailscale CLI를 부르지 않는 가벼운 신호라 페이지 밖에서도 돌려도 된다
const { data: mobileWebRunning } = useQuery({
  queryKey: ["mobile-web-running"],
  queryFn: () => ipcRenderer.invoke("get-mobile-web-running"),
  refetchInterval: 5000,
  enabled: !IS_REMOTE,
});

// 사이드바 메뉴를 의미 단위 섹션으로 그룹화
const allNavSections: { label: string; items: NavItem[] }[] = [
  {
    label: "둘러보기",
    items: [
      {
        to: "/library",
        name: "Library",
        icon: "solar:folder-with-files-bold-duotone",
        label: "라이브러리",
      },
      {
        to: "/history",
        name: "History",
        icon: "solar:clock-circle-bold-duotone",
        label: "읽음 기록",
      },
      {
        to: "/browse",
        name: "Browse",
        icon: "solar:tag-bold-duotone",
        label: "탐색",
      },
      {
        to: "/series-manager",
        name: "SeriesManager",
        icon: "solar:library-bold-duotone",
        label: "시리즈",
      },
    ],
  },
  {
    label: "다운로드",
    items: [
      {
        to: "/downloader",
        name: "Downloader",
        icon: "solar:download-square-bold-duotone",
        label: "다운로더",
      },
      {
        to: "/duplicates",
        name: "Duplicates",
        icon: "solar:copy-bold-duotone",
        label: "중복 정리",
      },
    ],
  },
  {
    label: "기타",
    items: [
      {
        to: "/statistics",
        name: "Statistics",
        icon: "solar:chart-square-bold-duotone",
        label: "통계",
      },
      {
        to: "/mobile",
        name: "Mobile",
        icon: "solar:smartphone-2-bold-duotone",
        label: "모바일",
        pcOnly: true,
      },
      {
        to: "/settings",
        name: "Settings",
        icon: "solar:settings-bold-duotone",
        label: "설정",
      },
    ],
  },
];

const navSections = allNavSections.map((section) => ({
  ...section,
  items: section.items.filter((item) => !(IS_REMOTE && item.pcOnly)),
}));

// 네비게이션 클릭 핸들러
const handleNavClick = (item: NavItem) => {
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
  emit("navigate");
};
</script>

<template>
  <aside
    :class="
      cn(
        'bg-muted flex flex-col border-r p-3 transition-all duration-300 ease-in-out',
        collapsed ? 'items-center' : '',
      )
    "
    style="-webkit-app-region: drag"
  >
    <TooltipProvider :delay-duration="0">
      <nav class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <template v-for="(section, sIdx) in navSections" :key="section.label">
          <!-- 섹션 라벨: 펼친 상태에서만 노출 -->
          <p
            v-if="!collapsed"
            :class="
              cn(
                'text-muted-foreground shrink-0 px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase',
                sIdx === 0 ? 'pt-1' : 'pt-3',
              )
            "
          >
            {{ section.label }}
          </p>
          <!-- 접힌 상태: 그룹 사이 구분선 -->
          <div
            v-else-if="sIdx !== 0"
            class="bg-border my-0.5 h-px w-7 shrink-0 self-center"
          />

          <Tooltip v-for="item in section.items" :key="item.to">
            <TooltipTrigger as-child>
              <button
                style="-webkit-app-region: no-drag"
                :class="
                  cn(
                    'text-muted-foreground hover:bg-accent hover:text-accent-foreground flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    collapsed ? 'h-10 w-10 justify-center' : '',
                    route.path === item.to
                      ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
                      : '',
                  )
                "
                @click="handleNavClick(item)"
              >
                <span class="relative flex shrink-0">
                  <Icon :icon="item.icon" class="h-5 w-5" />
                  <!-- 구독 신작 표시. 다운로더 화면에 들어가지 않아도 보여야 한다 -->
                  <span
                    v-if="
                      item.to === '/downloader' && subscriptionStore.hasUnseen
                    "
                    class="bg-destructive ring-background absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2"
                  />
                  <span
                    v-if="item.to === '/mobile' && mobileWebRunning"
                    class="ring-background absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 ring-2"
                  />
                </span>
                <span v-if="!collapsed" class="whitespace-nowrap">
                  {{ item.label }}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent v-if="collapsed" side="right">
              <p>{{ item.label }}</p>
            </TooltipContent>
          </Tooltip>
        </template>
      </nav>

      <div v-if="!expanded" class="mt-auto pt-2">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              style="-webkit-app-region: no-drag"
              :class="
                cn(
                  'text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  collapsed ? 'h-10 w-10 justify-center border' : 'w-full',
                )
              "
              @click="toggleSidebar"
            >
              <Icon
                :icon="
                  collapsed
                    ? 'solar:alt-arrow-right-bold-duotone'
                    : 'solar:alt-arrow-left-bold-duotone'
                "
                class="h-5 w-5"
              />
              <span v-if="!collapsed" class="whitespace-nowrap"> 접기 </span>
            </button>
          </TooltipTrigger>
          <TooltipContent v-if="collapsed" side="right">
            <p>펼치기</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  </aside>
</template>

<style scoped>
* {
  user-select: none;
}
</style>
