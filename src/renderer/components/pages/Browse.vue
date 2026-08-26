<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import SmartSearchInput from "../common/SmartSearchInput.vue";
import SortMenu from "../common/SortMenu.vue";
import PageHeader from "../layout/PageHeader.vue";
import PageToolbar from "../layout/PageToolbar.vue";
import { useQueryAndParams } from "@/composables/useQueryAndParams";
import {
  getArtistsWithCount,
  getTagsWithCount,
  getSeriesWithCount,
  getCharactersWithCount,
  getGroupsWithCount,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NameCount {
  name: string;
  count: number;
}

type TabKey = "artists" | "tags" | "series" | "characters" | "groups";

const router = useRouter();

// URL 상태 동기화
const tab = ref<TabKey>("artists");
const letter = ref("");
const browseSortBy = ref("name");

const { schWord: searchQuery } = useQueryAndParams({
  defaultOptions: {
    tab: "artists",
    browseSortBy: "name",
    schWord: "",
  },
  queries: {
    tab,
    letter,
    browseSortBy,
  },
});

// 탭 설정
const tabs: { key: TabKey; label: string }[] = [
  { key: "artists", label: "작가" },
  { key: "tags", label: "태그" },
  { key: "series", label: "시리즈" },
  { key: "characters", label: "캐릭터" },
  { key: "groups", label: "그룹" },
];

// 정렬 메뉴에 띄울 순서
const browseSortOptions = [
  { value: "name", label: "이름순" },
  { value: "count", label: "개수순" },
];

// 탭별 IPC 매핑
const queryFnMap: Record<TabKey, () => Promise<NameCount[]>> = {
  artists: getArtistsWithCount,
  tags: getTagsWithCount,
  series: getSeriesWithCount,
  characters: getCharactersWithCount,
  groups: getGroupsWithCount,
};

// 탭별 검색 프리픽스
const prefixMap: Record<TabKey, string> = {
  artists: "artist:",
  tags: "tag:",
  series: "series:",
  characters: "character:",
  groups: "group:",
};

// 데이터 쿼리 (탭 전환 시 해당 쿼리만 실행)
const { data: items, isLoading } = useQuery({
  queryKey: computed(() => ["browse", tab.value]),
  queryFn: () => queryFnMap[tab.value](),
});

// 필터링된 목록
const filteredItems = computed(() => {
  if (!items.value) return [];

  let result = items.value as NameCount[];

  // 검색 필터
  const query = searchQuery.value?.toLowerCase() || "";
  if (query) {
    result = result.filter((item) => item.name.toLowerCase().includes(query));
  }

  // 알파벳 필터
  if (letter.value) {
    if (letter.value === "123") {
      result = result.filter((item) => /^[^a-zA-Z]/.test(item.name));
    } else {
      const l = letter.value.toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().startsWith(l));
    }
  }

  // 정렬
  if (browseSortBy.value === "count") {
    result = [...result].sort((a, b) => b.count - a.count);
  }
  // name 정렬은 DB에서 이미 정렬됨

  return result;
});

// 알파벳 바
const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
const hasDigits = computed(() => {
  if (!items.value) return false;
  return (items.value as NameCount[]).some((item) =>
    /^[^a-zA-Z]/.test(item.name),
  );
});

// 항목 클릭 → 라이브러리 검색
const goToLibraryWithSearch = (name: string) => {
  const prefix = prefixMap[tab.value];
  router.push({ path: "/library", query: { schWord: `${prefix}${name}` } });
};
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <PageHeader icon="solar:tag-bold-duotone" title="탐색" />

    <!-- 콘텐츠 -->
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <!-- 탭 -->
      <Tabs v-model="tab" class="w-full">
        <TabsList>
          <TabsTrigger v-for="t in tabs" :key="t.key" :value="t.key">
            {{ t.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <!-- 검색 및 정렬 -->
      <PageToolbar>
        <template #search>
          <SmartSearchInput v-model="searchQuery" placeholder="이름으로 검색" />
        </template>

        <template #sort>
          <!-- 이름순은 오름차순, 개수순은 내림차순으로 고정이라 순서 토글이 없다 -->
          <SortMenu
            :options="browseSortOptions"
            :sort-by="browseSortBy"
            sort-order="asc"
            :show-order="false"
            @update:sort-by="browseSortBy = $event"
          />
        </template>

        <template #count> 총 {{ filteredItems.length }}개 </template>
      </PageToolbar>

      <!-- 알파벳 필터 바 -->
      <div class="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          :class="letter === '' ? 'bg-accent text-accent-foreground' : ''"
          class="h-7 px-2 text-xs"
          @click="letter = ''"
        >
          전체
        </Button>
        <Button
          v-if="hasDigits"
          variant="ghost"
          size="sm"
          :class="letter === '123' ? 'bg-accent text-accent-foreground' : ''"
          class="h-7 px-2 text-xs"
          @click="letter = '123'"
        >
          123
        </Button>
        <Button
          v-for="a in alphabet"
          :key="a"
          variant="ghost"
          size="sm"
          :class="letter === a ? 'bg-accent text-accent-foreground' : ''"
          class="h-7 px-2 text-xs"
          @click="letter = a"
        >
          {{ a }}
        </Button>
      </div>

      <!-- 항목 그리드 -->
      <ScrollArea class="flex-1">
        <div v-if="isLoading" class="text-muted-foreground">로딩 중...</div>
        <div
          v-else-if="filteredItems.length === 0"
          class="text-muted-foreground"
        >
          항목이 없습니다.
        </div>
        <div
          v-else
          class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        >
          <button
            v-for="item in filteredItems"
            :key="item.name"
            class="hover:bg-accent flex items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors"
            @click="goToLibraryWithSearch(item.name)"
          >
            <span class="truncate">{{ item.name }}</span>
            <span class="text-muted-foreground ml-2 shrink-0 text-xs">
              ({{ item.count }})
            </span>
          </button>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
