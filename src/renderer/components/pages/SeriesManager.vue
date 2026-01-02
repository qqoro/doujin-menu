<script setup lang="ts">
import HelpDialog from "@/components/common/HelpDialog.vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Icon } from "@iconify/vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type { SeriesCollectionWithBooks } from "../../../main/db/types";
import {
  deleteSeriesCollection,
  getSeriesCollections,
  runSeriesDetection,
} from "../../api";
import SeriesCollectionCard from "../feature/SeriesCollectionCard.vue";
import SeriesDetailDialog from "../feature/SeriesDetailDialog.vue";
import SeriesDetectionDialog from "../feature/SeriesDetectionDialog.vue";
import CreateSeriesDialog from "../feature/CreateSeriesDialog.vue";

const queryClient = useQueryClient();
const router = useRouter();

// 필터 및 정렬 상태
const filterType = ref<"all" | "auto" | "manual">("all");
const sortBy = ref<"name" | "book_count" | "confidence" | "created_at">("name");
const sortOrder = ref<"asc" | "desc">("asc");
const currentPage = ref(1);
const pageLimit = 50;

// 다이얼로그 상태
const showDetectionDialog = ref(false);
const showDetailDialog = ref(false);
const showCreateDialog = ref(false);
const showDeleteDialog = ref(false);
const selectedSeries = ref<SeriesCollectionWithBooks | null>(null);
const seriesToDelete = ref<number | null>(null);

// 시리즈 컬렉션 조회
const {
  data: seriesData,
  isLoading,
  refetch,
} = useQuery({
  queryKey: [
    "seriesCollections",
    { filterType, sortBy, sortOrder, page: currentPage, limit: pageLimit },
  ],
  queryFn: () =>
    getSeriesCollections({
      page: currentPage.value,
      limit: pageLimit,
      filterType: filterType.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    }),
});

// 계산된 속성
const collections = computed(() => seriesData.value?.collections || []);
const totalCount = computed(() => seriesData.value?.pagination?.totalCount || 0);
const totalPages = computed(() => seriesData.value?.pagination?.totalPages || 0);

// 자동 감지 실행 뮤테이션
const detectionMutation = useMutation({
  mutationFn: runSeriesDetection,
  onSuccess: (result) => {
    if (result) {
      toast.success(
        `자동 감지 완료: ${result.created_count}개 시리즈 생성 (${result.processed_books}권 처리)`,
      );
    }
    queryClient.invalidateQueries({ queryKey: ["seriesCollections"] });
  },
  onError: (error) => {
    toast.error(`자동 감지 실패: ${error.message}`);
  },
});

// 시리즈 삭제 뮤테이션
const deleteMutation = useMutation({
  mutationFn: deleteSeriesCollection,
  onSuccess: () => {
    toast.success("시리즈가 삭제되었습니다");
    queryClient.invalidateQueries({ queryKey: ["seriesCollections"] });
  },
  onError: (error) => {
    toast.error(`삭제 실패: ${error.message}`);
  },
});

// 자동 감지 실행
const handleRunDetection = () => {
  showDetectionDialog.value = true;
};

// 자동 감지 확정 실행
const handleConfirmDetection = (options: any) => {
  showDetectionDialog.value = false;
  detectionMutation.mutate(options);
};

// 시리즈 클릭
const handleSeriesClick = (series: any) => {
  selectedSeries.value = series;
  showDetailDialog.value = true;
};

// 시리즈 삭제 요청
const handleDeleteSeries = (seriesId: number) => {
  seriesToDelete.value = seriesId;
  showDeleteDialog.value = true;
};

// 시리즈 삭제 확정
const confirmDelete = () => {
  if (seriesToDelete.value !== null) {
    deleteMutation.mutate(seriesToDelete.value);
    seriesToDelete.value = null;
  }
  showDeleteDialog.value = false;
};

// 페이지 변경
const handlePageChange = (newPage: number) => {
  currentPage.value = newPage;
};

// 정렬 기준 설정
const setSortBy = (column: string) => {
  sortBy.value = column as "name" | "book_count" | "confidence" | "created_at";
};

// 정렬 순서 토글
const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
};
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 헤더 -->
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Icon icon="solar:library-bold-duotone" class="h-6 w-6" />
        <h2 class="text-2xl font-bold">시리즈</h2>
        <HelpDialog
          title="시리즈 도움말"
          description="시리즈 관리 사용법 및 자동 감지 팁"
        >
          <template #trigger>
            <Button variant="ghost" size="icon">
              <Icon icon="solar:question-circle-bold-duotone" class="h-6 w-6" />
            </Button>
          </template>
          <div class="text-muted-foreground space-y-4 text-sm">
            <p>이 화면에서는 시리즈를 관리하고 열람할 수 있습니다.</p>
            <h3 class="text-foreground text-base font-semibold">자동 감지</h3>
            <ul class="list-inside list-disc">
              <li>
                제목 패턴, 작가, 태그 등을 분석하여 시리즈를 자동으로
                감지합니다.
              </li>
              <li>
                자동 감지 실행 시 기존 자동 생성 시리즈는 삭제되고 다시
                인식됩니다.
              </li>
              <li>수동으로 편집한 시리즈는 자동 감지에서 보호됩니다.</li>
              <li>신뢰도 점수를 참고하여 감지 결과를 확인하세요.</li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">시리즈 관리</h3>
            <ul class="list-inside list-disc">
              <li>시리즈 카드를 클릭하여 상세 정보를 확인할 수 있습니다.</li>
              <li>상세 화면에서 시리즈명, 설명 등을 수정할 수 있습니다.</li>
              <li>시리즈에 속한 책들의 순서를 조정할 수 있습니다.</li>
              <li>필요 없는 시리즈는 삭제할 수 있습니다.</li>
            </ul>
            <h3 class="text-foreground text-base font-semibold">
              필터 및 정렬
            </h3>
            <ul class="list-inside list-disc">
              <li>자동 생성/수동 생성 시리즈를 필터링할 수 있습니다.</li>
              <li>이름, 권수, 신뢰도, 생성일 기준으로 정렬할 수 있습니다.</li>
            </ul>
          </div>
        </HelpDialog>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="showCreateDialog = true">
          <Icon icon="solar:add-circle-bold-duotone" class="mr-2 h-4 w-4" />
          새 시리즈
        </Button>
        <Button
          :disabled="detectionMutation.isPending.value"
          @click="handleRunDetection"
        >
          <Icon icon="solar:magic-stick-3-bold-duotone" class="mr-2 h-4 w-4" />
          자동 감지 실행
        </Button>
      </div>
    </div>

    <!-- 필터 및 정렬 영역 -->
    <div class="mb-4 flex items-center gap-2">
      <Select v-model="filterType">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="필터 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          <SelectItem value="auto">자동 생성만</SelectItem>
          <SelectItem value="manual">수동 생성만</SelectItem>
        </SelectContent>
      </Select>

      <div class="inline-flex">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="rounded-r-none">
              <Icon icon="solar:sort-bold-duotone" class="h-4 w-4" />
              정렬
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>정렬 기준</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="setSortBy('name')">
              이름순
              <Icon
                v-if="sortBy === 'name'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('book_count')">
              권수순
              <Icon
                v-if="sortBy === 'book_count'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('confidence')">
              신뢰도순
              <Icon
                v-if="sortBy === 'confidence'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
            <DropdownMenuItem @click="setSortBy('created_at')">
              생성일순
              <Icon
                v-if="sortBy === 'created_at'"
                icon="solar:check-circle-bold-duotone"
                class="ml-auto h-4 w-4"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          class="rounded-l-none border-l-0"
          @click="toggleSortOrder"
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
      </div>

      <div class="flex-1" />

      <div class="text-muted-foreground text-sm">
        총 {{ totalCount }}개 시리즈
      </div>
    </div>

    <!-- 로딩 중 -->
    <div
      v-if="isLoading"
      class="flex flex-grow flex-col items-center justify-center text-center"
    >
      <div
        class="text-muted-foreground mb-4 flex flex-col items-center justify-center gap-2 text-lg"
      >
        <Icon icon="svg-spinners:ring-resize" class="size-8" />
        <p>로딩중...</p>
      </div>
    </div>

    <!-- 시리즈 그리드 -->
    <div
      v-else-if="collections.length > 0"
      class="grid flex-grow grid-cols-1 items-start gap-4 overflow-y-auto sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
    >
      <SeriesCollectionCard
        v-for="series in collections"
        :key="series.id"
        :series="series"
        @click="handleSeriesClick(series)"
        @delete="handleDeleteSeries(series.id)"
      />
    </div>

    <!-- 빈 상태 -->
    <div
      v-else
      class="flex flex-grow flex-col items-center justify-center text-center"
    >
      <div
        class="text-muted-foreground mb-4 flex flex-col items-center justify-center gap-2 text-lg"
      >
        <Icon icon="solar:library-bold-duotone" class="h-16 w-16" />
        <div>
          <h3 class="text-lg font-semibold">시리즈가 없습니다</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            자동 감지를 실행하여 시리즈를 생성하세요
          </p>
        </div>
        <Button @click="handleRunDetection">
          <Icon icon="solar:magic-stick-3-bold-duotone" class="mr-2 h-4 w-4" />
          자동 감지 실행
        </Button>
      </div>
    </div>

    <!-- 페이지네이션 -->
    <div
      v-if="totalPages > 1 && !isLoading"
      class="flex items-center justify-center gap-2 pt-4"
    >
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage === 1"
        @click="handlePageChange(currentPage - 1)"
      >
        <Icon icon="solar:alt-arrow-left-linear" class="h-4 w-4" />
      </Button>
      <span class="text-sm"> {{ currentPage }} / {{ totalPages }} </span>
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage === totalPages"
        @click="handlePageChange(currentPage + 1)"
      >
        <Icon icon="solar:alt-arrow-right-linear" class="h-4 w-4" />
      </Button>
    </div>

    <!-- 자동 감지 다이얼로그 -->
    <SeriesDetectionDialog
      v-model:open="showDetectionDialog"
      @confirm="handleConfirmDetection"
    />

    <!-- 시리즈 상세 다이얼로그 -->
    <SeriesDetailDialog
      v-model:open="showDetailDialog"
      :series="selectedSeries"
      @updated="refetch"
    />

    <!-- 새 시리즈 만들기 다이얼로그 -->
    <CreateSeriesDialog
      v-model:open="showCreateDialog"
      @created="refetch"
    />

    <!-- 시리즈 삭제 확인 다이얼로그 -->
    <AlertDialog :open="showDeleteDialog" @update:open="showDeleteDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>시리즈 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            정말 이 시리즈를 삭제하시겠습니까? 시리즈에 속한 책들은 시리즈에서 제거되지만 책 자체는 삭제되지 않습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction @click="confirmDelete">삭제</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
