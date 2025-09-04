<script setup lang="ts">
import { getLibrarySize, getStatistics } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@iconify/vue";
import { useQuery } from "@tanstack/vue-query";
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
  <div class="h-full flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold flex items-center gap-2">
        <Icon icon="solar:chart-square-bold-duotone" class="w-7 h-7" />
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
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <!-- 총 책 권수 -->
        <Card class="lg:col-span-3">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:book-2-bold-duotone" class="w-6 h-6" />
              총 책 권수
            </CardTitle>
          </CardHeader>
          <CardContent
            class="text-5xl font-extrabold h-full text-center py-4 text-primary flex justify-center items-center"
          >
            {{ formatNumberWithCommas(statistics.totalBooks) }}권
          </CardContent>
        </Card>

        <!-- 가장 좋아하는 태그 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:tag-bold-duotone" class="w-6 h-6" />
              가장 좋아하는 태그
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="h-48 w-full rounded-md border p-4">
              <div v-if="statistics.topTags && statistics.topTags.length > 0">
                <div
                  v-for="tag in statistics.topTags"
                  :key="tag.name"
                  class="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent transition-colors cursor-pointer"
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
              <Icon icon="solar:user-circle-bold-duotone" class="w-6 h-6" />
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
                  class="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent transition-colors cursor-pointer"
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

        <!-- 가장 자주 본 책 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:eye-bold-duotone" class="w-6 h-6" />
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
                  class="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent transition-colors cursor-pointer"
                  @click="goToViewer(book.id)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-sm font-medium truncate">{{
                      book.title
                    }}</span>
                  </div>
                  <div class="text-sm text-gray-500 flex-shrink-0">
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

        <!-- 중복된 책 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:copy-bold-duotone" class="w-6 h-6" />
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
                <ScrollArea class="h-40 w-full rounded-md border p-4 mt-2">
                  <div
                    v-if="
                      statistics.duplicateBooks.byTitle &&
                      statistics.duplicateBooks.byTitle.length > 0
                    "
                  >
                    <div
                      v-for="(book, index) in statistics.duplicateBooks.byTitle"
                      :key="index"
                      class="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent transition-colors cursor-pointer"
                      @click="goToLibraryWithSearch(book.title)"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-medium truncate">{{
                          book.title
                        }}</span>
                      </div>
                      <div class="text-sm text-gray-500 flex-shrink-0">
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
                <ScrollArea class="h-40 w-full rounded-md border p-4 mt-2">
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
                      class="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent transition-colors cursor-pointer"
                      @click="goToLibraryWithSearch('id:' + book.hitomi_id)"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-medium truncate">{{
                          book.hitomi_id
                        }}</span>
                      </div>
                      <div class="text-sm text-gray-500 flex-shrink-0">
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

        <!-- 가장 긴/짧은 책 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:bookmark-bold-duotone" class="w-6 h-6" />
              가장 긴/짧은 책
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-2">
              <div
                v-if="statistics.longestBook"
                class="py-2 px-3 rounded-md hover:bg-accent transition-colors"
              >
                <p
                  class="text-sm font-medium cursor-pointer"
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
                class="py-2 px-3 rounded-md hover:bg-accent transition-colors"
              >
                <p
                  class="text-sm font-medium cursor-pointer"
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

        <!-- 라이브러리 크기 -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon icon="solar:folder-bold-duotone" class="w-6 h-6" />
              라이브러리 크기
            </CardTitle>
          </CardHeader>
          <CardContent
            class="text-4xl font-bold text-center py-4 flex justify-center items-center h-full"
          >
            <div v-if="isLibrarySizeLoading" class="text-sm text-gray-500">
              계산 중...
            </div>
            <div v-else-if="isLibrarySizeError" class="text-sm text-red-500">
              오류
            </div>
            <div v-else>
              {{ formatBytes(librarySize) }}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
