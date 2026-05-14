<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { Icon } from "@iconify/vue";
import { useQueryAndParams } from "@/composable/useQueryAndParams";
import {
  getArtistsWithCount,
  getTagsWithCount,
  getSeriesWithCount,
  getCharactersWithCount,
  getGroupsWithCount,
} from "@/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  <div class="flex h-full flex-col gap-4 p-6">
    <!-- 탭 -->
    <Tabs v-model="tab" class="w-full">
      <TabsList>
        <TabsTrigger v-for="t in tabs" :key="t.key" :value="t.key">
          {{ t.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <!-- 검색 및 정렬 -->
    <div class="flex items-center gap-3">
      <div class="relative flex-1">
        <Icon
          icon="solar:magnifer-linear"
          class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        />
        <Input v-model="searchQuery" placeholder="검색..." class="pl-9" />
      </div>
      <Select v-model="browseSortBy">
        <SelectTrigger class="w-[130px]">
          <SelectValue placeholder="정렬" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">이름순</SelectItem>
          <SelectItem value="count">개수순</SelectItem>
        </SelectContent>
      </Select>
    </div>

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
      <div v-else-if="filteredItems.length === 0" class="text-muted-foreground">
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
</template>
