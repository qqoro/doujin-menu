<script setup lang="ts">
import { getAppUsageStats, getLibrarySize, getStatistics } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@iconify/vue";
import { useQuery } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router"; // useRouter 임포트

const router = useRouter(); // useRouter 초기화

const {
  data: statistics,
  isLoading,
  isError,
} = useQuery({
  queryKey: ["statistics"],
  queryFn: getStatistics,
});

const {
  data: librarySize,
  isLoading: isLibrarySizeLoading,
  isError: isLibrarySizeError,
} = useQuery({
  queryKey: ["librarySize"],
  queryFn: getLibrarySize,
});

const {
  data: appUsageStats,
  isLoading: isAppUsageStatsLoading,
  isError: isAppUsageStatsError,
} = useQuery({
  queryKey: ["appUsageStats"],
  queryFn: getAppUsageStats,
});

// 실시간 사용 시간 업데이트를 위한 상태
const currentTime = ref(Date.now());
let updateInterval: NodeJS.Timeout | null = null;

// 실시간으로 계산된 사용 시간
const liveUsageStats = computed(() => {
  if (!appUsageStats.value) return null;

  // 현재 세션 시작 시간이 있으면 경과 시간 계산
  let elapsedSeconds = 0;
  if (appUsageStats.value.currentSessionStartTime) {
    const sessionStart = new Date(
      appUsageStats.value.currentSessionStartTime,
    ).getTime();
    elapsedSeconds = Math.floor((currentTime.value - sessionStart) / 1000);
  }

  return {
    today: appUsageStats.value.today + elapsedSeconds,
    week: appUsageStats.value.week + elapsedSeconds,
    month: appUsageStats.value.month + elapsedSeconds,
    total: appUsageStats.value.total + elapsedSeconds,
    averageDaily: appUsageStats.value.averageDaily,
  };
});

// 컴포넌트 마운트 시 1초마다 현재 시간 업데이트
onMounted(() => {
  updateInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
});

// 컴포넌트 언마운트 시 interval 정리
onBeforeUnmount(() => {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
});

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// 천 단위 쉼표 포맷 함수 추가
const formatNumberWithCommas = (num: number) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// 초를 시:분:초 포맷으로 변환 (또는 분:초)
const formatDuration = (seconds: number) => {
  if (seconds === 0) return "0초";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}초`);

  return parts.join(" ");
};

// 라이브러리 검색 페이지로 이동 함수
const goToLibraryWithSearch = (query: string) => {
  router.push({ path: "/library", query: { schWord: query } });
};

// 뷰어 페이지로 이동 함수
const goToViewer = (bookId: number) => {
  router.push({ name: "Viewer", params: { id: bookId } });
};
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="flex items-center gap-2 text-2xl font-bold">
        <Icon icon="solar:chart-square-bold-duotone" class="h-7 w-7" />
        통계
      </h1>
    </div>

    <div class="flex-grow overflow-y-auto pr-4">
      <div v-if="isLoading" class="text-center text-gray-500">
        통계 데이터를 불러오는 중...
      </div>
      <div v-else-if="isError" class="text-center text-red-500">
        통계 데이터를 불러오는데 실패했습니다.
      </div>
      <div
        v-else-if="statistics"
        class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        <!-- 총 책 권수 -->
        <Card class="lg:col-span-3">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:book-2-bold-duotone" class="h-6 w-6" />
              총 책 권수
            </CardTitle>
          </CardHeader>
          <CardContent
            class="text-primary flex h-full items-center justify-center py-4 text-center text-5xl font-extrabold"
          >
            {{ formatNumberWithCommas(statistics.totalBooks) }}권
          </CardContent>
        </Card>

        <!-- [읽기 관련] -->
        <!-- 읽기 진행 상황 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:book-bookmark-bold-duotone" class="h-6 w-6" />
              읽기 진행 상황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm">완독</span>
                <span class="font-semibold">
                  {{
                    formatNumberWithCommas(statistics.readingProgress.read)
                  }}권
                  <span class="text-xs text-gray-500">
                    ({{
                      (
                        (statistics.readingProgress.read /
                          statistics.totalBooks) *
                        100
                      ).toFixed(1)
                    }}%)
                  </span>
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm">읽는 중</span>
                <span class="font-semibold">
                  {{
                    formatNumberWithCommas(statistics.readingProgress.reading)
                  }}권
                  <span class="text-xs text-gray-500">
                    ({{
                      (
                        (statistics.readingProgress.reading /
                          statistics.totalBooks) *
                        100
                      ).toFixed(1)
                    }}%)
                  </span>
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm">안 읽음</span>
                <span class="font-semibold">
                  {{
                    formatNumberWithCommas(statistics.readingProgress.unread)
                  }}권
                  <span class="text-xs text-gray-500">
                    ({{
                      (
                        (statistics.readingProgress.unread /
                          statistics.totalBooks) *
                        100
                      ).toFixed(1)
                    }}%)
                  </span>
                </span>
              </div>
              <div class="bg-border my-2 h-px"></div>
              <div class="flex items-center justify-between">
                <span class="text-sm">즐겨찾기</span>
                <span
                  class="font-semibold text-yellow-600 dark:text-yellow-500"
                >
                  {{
                    formatNumberWithCommas(
                      statistics.readingProgress.favorites,
                    )
                  }}권
                  <span class="text-xs text-gray-500">
                    ({{
                      (
                        (statistics.readingProgress.favorites /
                          statistics.totalBooks) *
                        100
                      ).toFixed(1)
                    }}%)
                  </span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 가장 자주 본 책 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:eye-bold-duotone" class="h-6 w-6" />
              가장 자주 본 책
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-48 w-full rounded-md border p-4">
              <div
                v-if="
                  statistics.mostViewedBooks &&
                  statistics.mostViewedBooks.length > 0
                "
              >
                <div
                  v-for="book in statistics.mostViewedBooks"
                  :key="book.id"
                  class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                  @click="goToViewer(book.id)"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-sm font-medium">{{
                      book.title
                    }}</span>
                  </div>
                  <div class="flex-shrink-0 text-sm text-gray-500">
                    {{ book.view_count }}회
                  </div>
                </div>
              </div>
              <div v-else class="text-center text-gray-500">
                아직 조회 기록이 없습니다.
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <!-- [컬렉션 분석] -->
        <!-- 가장 좋아하는 태그 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:tag-bold-duotone" class="h-6 w-6" />
              가장 좋아하는 태그
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-48 w-full rounded-md border p-4">
              <div v-if="statistics.topTags && statistics.topTags.length > 0">
                <div
                  v-for="tag in statistics.topTags"
                  :key="tag.name"
                  class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                  @click="goToLibraryWithSearch('tag:' + tag.name)"
                >
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary">{{ tag.name }}</Badge>
                    <span class="text-sm text-gray-500"
                      >({{ tag.count }}권)</span
                    >
                  </div>
                  <div class="text-sm font-semibold">
                    {{
                      ((tag.count / statistics.totalBooks) * 100).toFixed(1)
                    }}%
                  </div>
                </div>
              </div>
              <div v-else class="text-center text-gray-500">
                데이터가 없습니다.
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <!-- 가장 좋아하는 작가 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:user-circle-bold-duotone" class="h-6 w-6" />
              가장 좋아하는 작가
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-48 w-full rounded-md border p-4">
              <div
                v-if="statistics.topArtists && statistics.topArtists.length > 0"
              >
                <div
                  v-for="artist in statistics.topArtists"
                  :key="artist.name"
                  class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                  @click="goToLibraryWithSearch('artist:' + artist.name)"
                >
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary">{{ artist.name }}</Badge>
                    <span class="text-sm text-gray-500"
                      >({{ artist.count }}권)</span
                    >
                  </div>
                  <div class="text-sm font-semibold">
                    {{
                      ((artist.count / statistics.totalBooks) * 100).toFixed(1)
                    }}%
                  </div>
                </div>
              </div>
              <div v-else class="text-center text-gray-500">
                데이터가 없습니다.
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <!-- 가장 좋아하는 그룹 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon
                icon="solar:users-group-two-rounded-bold-duotone"
                class="h-6 w-6"
              />
              가장 좋아하는 그룹
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-48 w-full rounded-md border p-4">
              <div
                v-if="statistics.topGroups && statistics.topGroups.length > 0"
              >
                <div
                  v-for="group in statistics.topGroups"
                  :key="group.name"
                  class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                  @click="goToLibraryWithSearch('group:' + group.name)"
                >
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary">{{ group.name }}</Badge>
                    <span class="text-sm text-gray-500"
                      >({{ group.count }}권)</span
                    >
                  </div>
                  <div class="text-sm font-semibold">
                    {{
                      ((group.count / statistics.totalBooks) * 100).toFixed(1)
                    }}%
                  </div>
                </div>
              </div>
              <div v-else class="text-center text-gray-500">
                데이터가 없습니다.
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <!-- 가장 많이 등장하는 캐릭터 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:user-bold-duotone" class="h-6 w-6" />
              가장 많이 등장하는 캐릭터
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-48 w-full rounded-md border p-4">
              <div
                v-if="
                  statistics.topCharacters &&
                  statistics.topCharacters.length > 0
                "
              >
                <div
                  v-for="character in statistics.topCharacters"
                  :key="character.name"
                  class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                  @click="goToLibraryWithSearch('character:' + character.name)"
                >
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary">{{ character.name }}</Badge>
                    <span class="text-sm text-gray-500"
                      >({{ character.count }}권)</span
                    >
                  </div>
                  <div class="text-sm font-semibold">
                    {{
                      ((character.count / statistics.totalBooks) * 100).toFixed(
                        1,
                      )
                    }}%
                  </div>
                </div>
              </div>
              <div v-else class="text-center text-gray-500">
                데이터가 없습니다.
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <!-- 가장 많은 책이 있는 시리즈 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:library-bold-duotone" class="h-6 w-6" />
              가장 많은 책이 있는 시리즈
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-48 w-full rounded-md border p-4">
              <div
                v-if="statistics.topSeries && statistics.topSeries.length > 0"
              >
                <div
                  v-for="series in statistics.topSeries"
                  :key="series.name"
                  class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                  @click="goToLibraryWithSearch('series:' + series.name)"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-sm font-medium">{{
                      series.name
                    }}</span>
                  </div>
                  <div class="flex-shrink-0 text-sm text-gray-500">
                    {{ series.count }}권
                  </div>
                </div>
              </div>
              <div v-else class="text-center text-gray-500">
                데이터가 없습니다.
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <!-- [통계 정보] -->
        <!-- 총 페이지 수 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:document-bold-duotone" class="h-6 w-6" />
              페이지 통계
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div>
                <p class="mb-1 text-sm text-gray-500">총 페이지 수</p>
                <p class="text-primary text-3xl font-bold">
                  {{ formatNumberWithCommas(statistics.totalPages) }}
                </p>
              </div>
              <div class="bg-border my-2 h-px"></div>
              <div>
                <p class="mb-1 text-sm text-gray-500">읽은 페이지 수</p>
                <p
                  class="text-2xl font-semibold text-green-600 dark:text-green-500"
                >
                  {{ formatNumberWithCommas(statistics.readPages) }}
                  <span class="text-sm text-gray-500">
                    ({{
                      (
                        (statistics.readPages / statistics.totalPages) *
                        100
                      ).toFixed(1)
                    }}%)
                  </span>
                </p>
              </div>
              <div class="bg-border my-2 h-px"></div>
              <div>
                <p class="mb-1 text-sm text-gray-500">평균 페이지 수</p>
                <p class="text-xl font-semibold">
                  {{ formatNumberWithCommas(statistics.averagePages) }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 라이브러리 크기 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:folder-bold-duotone" class="h-6 w-6" />
              라이브러리 크기
            </CardTitle>
          </CardHeader>
          <CardContent
            class="flex h-full items-center justify-center py-4 text-center text-4xl font-bold"
          >
            <div v-if="isLibrarySizeLoading" class="text-sm text-gray-500">
              계산 중...
            </div>
            <div v-else-if="isLibrarySizeError" class="text-sm text-red-500">
              오류
            </div>
            <div v-else>
              {{ formatBytes(librarySize ?? 0) }}
            </div>
          </CardContent>
        </Card>

        <!-- 앱 사용 시간 -->
        <Card class="lg:col-span-2">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:clock-circle-bold-duotone" class="h-6 w-6" />
              앱 사용 시간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              v-if="isAppUsageStatsLoading"
              class="text-center text-gray-500"
            >
              불러오는 중...
            </div>
            <div
              v-else-if="isAppUsageStatsError"
              class="text-center text-red-500"
            >
              오류
            </div>
            <div
              v-else-if="liveUsageStats"
              class="grid grid-cols-2 gap-4 md:grid-cols-4"
            >
              <div class="space-y-1">
                <p class="text-sm text-gray-500">오늘</p>
                <p class="text-2xl font-bold text-blue-600 dark:text-blue-500">
                  {{ formatDuration(liveUsageStats.today) }}
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-sm text-gray-500">이번 주</p>
                <p
                  class="text-2xl font-bold text-green-600 dark:text-green-500"
                >
                  {{ formatDuration(liveUsageStats.week) }}
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-sm text-gray-500">이번 달</p>
                <p
                  class="text-2xl font-bold text-purple-600 dark:text-purple-500"
                >
                  {{ formatDuration(liveUsageStats.month) }}
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-sm text-gray-500">전체</p>
                <p
                  class="text-2xl font-bold text-orange-600 dark:text-orange-500"
                >
                  {{ formatDuration(liveUsageStats.total) }}
                </p>
              </div>
              <div class="col-span-2 space-y-1 md:col-span-4">
                <div class="bg-border my-2 h-px"></div>
                <p class="text-sm text-gray-500">평균 일일 사용 시간</p>
                <p class="text-xl font-semibold">
                  {{ formatDuration(liveUsageStats.averageDaily) }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 타입별 분포 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:layers-bold-duotone" class="h-6 w-6" />
              타입별 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              v-if="
                statistics.typeDistribution &&
                statistics.typeDistribution.length > 0
              "
              class="space-y-2"
            >
              <div
                v-for="type in statistics.typeDistribution"
                :key="type.type"
                class="flex items-center justify-between"
              >
                <span class="text-sm">{{ type.type || "미지정" }}</span>
                <span class="font-semibold">
                  {{ formatNumberWithCommas(type.count) }}권
                  <span class="text-xs text-gray-500">
                    ({{
                      ((type.count / statistics.totalBooks) * 100).toFixed(1)
                    }}%)
                  </span>
                </span>
              </div>
            </div>
            <div v-else class="text-center text-gray-500">
              데이터가 없습니다.
            </div>
          </CardContent>
        </Card>

        <!-- [관리 도구] -->
        <!-- 가장 긴/짧은 책 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:bookmark-bold-duotone" class="h-6 w-6" />
              가장 긴/짧은 책
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-2">
              <div
                v-if="statistics.longestBook"
                class="hover:bg-accent rounded-md px-3 py-2 transition-colors"
              >
                <p
                  class="cursor-pointer text-sm font-medium"
                  @click="goToViewer(statistics.longestBook.id)"
                >
                  가장 긴 책: {{ statistics.longestBook.title }} ({{
                    statistics.longestBook.page_count
                  }}
                  페이지)
                </p>
              </div>
              <div v-else class="text-sm text-gray-500">
                가장 긴 책 데이터가 없습니다.
              </div>

              <div
                v-if="statistics.shortestBook"
                class="hover:bg-accent rounded-md px-3 py-2 transition-colors"
              >
                <p
                  class="cursor-pointer text-sm font-medium"
                  @click="goToViewer(statistics.shortestBook.id)"
                >
                  가장 짧은 책: {{ statistics.shortestBook.title }} ({{
                    statistics.shortestBook.page_count
                  }}
                  페이지)
                </p>
              </div>
              <div v-else class="text-sm text-gray-500">
                가장 짧은 책 데이터가 없습니다.
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 중복된 책 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:copy-bold-duotone" class="h-6 w-6" />
              중복된 책
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs default-value="byTitle" class="w-full">
              <TabsList class="grid w-full grid-cols-2">
                <TabsTrigger value="byTitle"> 제목 </TabsTrigger>
                <TabsTrigger value="byHitomiId"> Hitomi ID </TabsTrigger>
              </TabsList>
              <TabsContent value="byTitle">
                <ScrollArea class="mt-2 h-40 w-full rounded-md border p-4">
                  <div
                    v-if="
                      statistics.duplicateBooks.byTitle &&
                      statistics.duplicateBooks.byTitle.length > 0
                    "
                  >
                    <div
                      v-for="(book, index) in statistics.duplicateBooks.byTitle"
                      :key="index"
                      class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                      @click="goToLibraryWithSearch(book.title)"
                    >
                      <div class="flex min-w-0 items-center gap-2">
                        <span class="truncate text-sm font-medium">{{
                          book.title
                        }}</span>
                      </div>
                      <div class="flex-shrink-0 text-sm text-gray-500">
                        {{ book.count }}권
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-center text-gray-500">
                    중복된 책이 없습니다.
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="byHitomiId">
                <ScrollArea class="mt-2 h-40 w-full rounded-md border p-4">
                  <div
                    v-if="
                      statistics.duplicateBooks.byHitomiId &&
                      statistics.duplicateBooks.byHitomiId.length > 0
                    "
                  >
                    <div
                      v-for="(book, index) in statistics.duplicateBooks
                        .byHitomiId"
                      :key="index"
                      class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors"
                      @click="goToLibraryWithSearch('id:' + book.hitomi_id)"
                    >
                      <div class="flex min-w-0 items-center gap-2">
                        <span class="truncate text-sm font-medium">{{
                          book.hitomi_id
                        }}</span>
                      </div>
                      <div class="flex-shrink-0 text-sm text-gray-500">
                        {{ book.count }}권
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-center text-gray-500">
                    중복된 책이 없습니다.
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
