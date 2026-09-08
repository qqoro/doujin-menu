<script setup lang="ts">
import {
  backfillCoverHashes,
  deleteDuplicateBooks,
  getDuplicateGroups,
  ipcRenderer,
} from "@/api";
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import SortMenu from "@/components/common/SortMenu.vue";
import ViewOptionsBar from "@/components/common/ViewOptionsBar.vue";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useZoomWheel } from "@/composables/useZoomWheel";
import {
  computeGroupHighlight,
  filterGroups,
  formatBytes,
  groupReclaimableSize,
  groupTitle,
  matchTypeBadgeVariant,
  matchTypeLabel,
  sortGroups,
  summarizeGroups,
  type DuplicateSortBy,
} from "@/lib/duplicateCompare";
import {
  computeListCols,
  LIST_GAP,
  MIN_LIST_CARD_WIDTH,
} from "@/lib/virtualList";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import type {
  CoverHashProgress,
  DuplicateBookInfo,
  DuplicateGroup,
} from "../../../types/ipc";
import BookPreviewDialog from "../feature/BookPreviewDialog.vue";
import DuplicateBookRow from "../feature/DuplicateBookRow.vue";
import PageHeader from "../layout/PageHeader.vue";
import PageToolbar from "../layout/PageToolbar.vue";

const queryClient = useQueryClient();
const uiStore = useUiStore();

const { handleZoomWheel } = useZoomWheel();

/**
 * 그룹 안 카드를 몇 열로 깔지. 다른 목록 화면(`useVirtualCardList`)과 같은
 * 기준을 쓴다 — 이 화면은 가상 스크롤을 안 써서 열 수만 따로 계산한다.
 */
const scrollerRef = ref<HTMLElement | null>(null);
const scrollerWidth = ref(0);

const listCols = computed(() =>
  computeListCols(
    scrollerWidth.value,
    uiStore.thumbnailZoom,
    0,
    LIST_GAP,
    MIN_LIST_CARD_WIDTH,
  ),
);

let resizeObserver: ResizeObserver | null = null;
watch(scrollerRef, (el) => {
  resizeObserver?.disconnect();
  if (!el) return;
  scrollerWidth.value = el.clientWidth;
  resizeObserver = new ResizeObserver(() => {
    scrollerWidth.value = el.clientWidth;
  });
  resizeObserver.observe(el);
});

// 중복 그룹 목록 조회
const { data, status, isFetching, refetch } = useQuery<DuplicateGroup[]>({
  queryKey: ["duplicateGroups"],
  queryFn: getDuplicateGroups,
});

const groups = computed(() => data.value ?? []);

// 표지 해시 백필. 대상이 없으면 즉시 끝나므로 두 번째 진입부터는 체감이 없다
const hashProgress = ref<CoverHashProgress | null>(null);

const handleHashProgress = (
  _event: Electron.IpcRendererEvent,
  progress: CoverHashProgress,
) => {
  hashProgress.value = progress;
};

onMounted(async () => {
  ipcRenderer.on("cover-hash-progress", handleHashProgress);
  try {
    const hashed = await backfillCoverHashes();
    // 새로 채운 게 있을 때만 다시 가져온다. 없으면 방금 받은 목록이 이미 최신이다
    if (hashed > 0) {
      queryClient.invalidateQueries({ queryKey: ["duplicateGroups"] });
    }
  } catch (error) {
    console.error("표지 해시 생성 실패:", error);
    toast.error("표지 해시 생성에 실패했습니다.");
  } finally {
    hashProgress.value = null;
  }
});

// keep-alive 아래에서 재마운트되므로 반드시 풀어줘야 핸들러가 쌓이지 않는다
onUnmounted(() => {
  ipcRenderer.off("cover-hash-progress", handleHashProgress);
  resizeObserver?.disconnect();
});

// 검색·필터·정렬
const searchQuery = ref("");
const matchTypeFilter = ref<"all" | DuplicateGroup["matchType"]>("all");
const sortBy = ref<DuplicateSortBy>("reclaimable");

const SORT_OPTIONS = [
  { value: "reclaimable", label: "절약 가능 용량" },
  { value: "count", label: "사본 수" },
  { value: "title", label: "제목" },
];

const visibleGroups = computed(() =>
  sortGroups(
    filterGroups(groups.value, searchQuery.value, matchTypeFilter.value),
    sortBy.value,
  ),
);

const summary = computed(() => summarizeGroups(visibleGroups.value));

/** hitomi_id와 제목이 우연히 같아도 키가 겹치지 않게 매치 타입을 섞는다 */
const groupId = (group: DuplicateGroup) => `${group.matchType}:${group.key}`;

// 강조 값은 그룹당 한 번만 센다. 행마다 부르면 사본 수의 제곱만큼 돈다
const highlightById = computed(
  () =>
    new Map(
      visibleGroups.value.map((group) => [
        groupId(group),
        computeGroupHighlight(group.books),
      ]),
    ),
);

// 접힌 그룹. 판단이 끝난 그룹을 치워가며 진행하라고 둔다
const collapsedIds = ref<Set<string>>(new Set());

const isCollapsed = (group: DuplicateGroup) =>
  collapsedIds.value.has(groupId(group));

const toggleCollapse = (group: DuplicateGroup) => {
  const next = new Set(collapsedIds.value);
  const id = groupId(group);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  collapsedIds.value = next;
};

const isAllCollapsed = computed(
  () =>
    visibleGroups.value.length > 0 &&
    visibleGroups.value.every((group) => isCollapsed(group)),
);

const toggleCollapseAll = () => {
  collapsedIds.value = isAllCollapsed.value
    ? new Set()
    : new Set(visibleGroups.value.map(groupId));
};

// 선택된 책 ID 집합 (반응성 보장을 위해 토글 시 new Set으로 교체)
const selectedIds = ref<Set<number>>(new Set());

const isDeleting = ref(false);
const isTrashDialogOpen = ref(false);
const isPermanentDialogOpen = ref(false);

const previewBook = ref<DuplicateBookInfo | null>(null);
const isPreviewOpen = ref(false);

const openPreview = (book: DuplicateBookInfo) => {
  previewBook.value = book;
  isPreviewOpen.value = true;
};

const toggleSelect = (bookId: number) => {
  const next = new Set(selectedIds.value);
  if (next.has(bookId)) {
    next.delete(bookId);
  } else {
    next.add(bookId);
  }
  selectedIds.value = next;
};

const selectedCount = computed(() => selectedIds.value.size);

// 그룹 전체가 선택되었는지 여부 (원본까지 전부 삭제 — 경고 대상)
const isGroupFullySelected = (group: DuplicateGroup) =>
  group.books.every((book) => selectedIds.value.has(book.id));

/**
 * 필터에 걸러진 그룹까지 본다. 선택해 둔 뒤 검색을 걸었다고 경고가 사라지면
 * 위험한 선택이 화면 밖에 숨은 채로 삭제된다.
 */
const hasFullySelectedGroup = computed(() =>
  groups.value.some(
    (group) => group.books.length > 0 && isGroupFullySelected(group),
  ),
);

/** 그룹 헤더에 띄우는 절약 가능 용량. 용량 미상 사본이 섞이면 표시하지 않는다 */
const reclaimableLabel = (group: DuplicateGroup) => {
  const size = groupReclaimableSize(group.books);
  return size == null ? null : `${formatBytes(size)} 절약 가능`;
};

// 휴지통/영구 삭제 실행
const performDelete = async (permanent: boolean) => {
  const bookIds = Array.from(selectedIds.value);
  if (bookIds.length === 0) {
    return;
  }

  isDeleting.value = true;
  try {
    const result = await deleteDuplicateBooks(bookIds, permanent);

    // 부분 실패 처리: errors가 있으면 경고 토스트
    if (result.errors && result.errors.length > 0) {
      toast.warning(
        `${result.deletedCount}개 삭제 완료, ${result.failedCount}개 실패`,
      );
    } else {
      toast.success(
        permanent
          ? `${result.deletedCount}개 영구 삭제 완료`
          : `${result.deletedCount}개 휴지통으로 이동 완료`,
      );
    }

    // 선택 초기화 및 캐시 무효화
    selectedIds.value = new Set();
    queryClient.invalidateQueries({ queryKey: ["duplicateGroups"] });
    queryClient.invalidateQueries({ queryKey: ["books"] });
  } catch (error) {
    // IPC 자체 오류
    console.error("중복 책 삭제 실패:", error);
    toast.error("삭제 중 오류가 발생했습니다.");
  } finally {
    isDeleting.value = false;
    isTrashDialogOpen.value = false;
    isPermanentDialogOpen.value = false;
  }
};

const confirmTrash = () => performDelete(false);
const confirmPermanent = () => performDelete(true);
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <PageHeader icon="solar:copy-bold-duotone" title="중복 정리">
      <template #actions>
        <Button
          variant="outline"
          :disabled="visibleGroups.length === 0"
          @click="toggleCollapseAll"
        >
          <Icon
            :icon="
              isAllCollapsed
                ? 'solar:maximize-square-3-bold-duotone'
                : 'solar:minimize-square-3-bold-duotone'
            "
            class="h-4 w-4"
          />
          {{ isAllCollapsed ? "모두 펼치기" : "모두 접기" }}
        </Button>
        <Button variant="outline" :disabled="isFetching" @click="refetch()">
          <Icon
            icon="solar:refresh-bold-duotone"
            class="h-4 w-4"
            :class="{ 'animate-spin': isFetching }"
          />
          새로고침
        </Button>
      </template>
    </PageHeader>

    <div
      v-if="hashProgress"
      class="bg-muted text-muted-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm"
    >
      <Icon icon="solar:refresh-bold-duotone" class="h-4 w-4 animate-spin" />
      표지 정보 준비 중 {{ hashProgress.current }} / {{ hashProgress.total }}
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <PageToolbar>
        <template #search>
          <SmartSearchInput
            v-model="searchQuery"
            placeholder="제목, 작가로 그룹 검색"
          />
        </template>

        <template #filter>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline">
                <Icon icon="solar:filter-bold-duotone" class="h-4 w-4" />
                필터
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>일치 기준</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                :model-value="matchTypeFilter === 'all'"
                @click="matchTypeFilter = 'all'"
              >
                전체
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                :model-value="matchTypeFilter === 'hitomi_id'"
                @click="matchTypeFilter = 'hitomi_id'"
              >
                ID 일치
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                :model-value="matchTypeFilter === 'title'"
                @click="matchTypeFilter = 'title'"
              >
                제목 일치
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                :model-value="matchTypeFilter === 'title_normalized'"
                @click="matchTypeFilter = 'title_normalized'"
              >
                제목 유사
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                :model-value="matchTypeFilter === 'cover_hash'"
                @click="matchTypeFilter = 'cover_hash'"
              >
                표지 유사
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>

        <template #sort>
          <!-- 기준마다 방향이 정해져 있다 (용량·사본 수는 많은 순, 제목은 가나다) -->
          <SortMenu
            :options="SORT_OPTIONS"
            :sort-by="sortBy"
            sort-order="desc"
            :show-order="false"
            @update:sort-by="sortBy = $event as DuplicateSortBy"
          />
        </template>

        <template #view>
          <!-- 그리드/리스트 전환은 이 화면에 의미가 없다. 썸네일 줌만 쓴다 -->
          <ViewOptionsBar model-value="list" :show-mode="false" />
        </template>

        <template #status>
          <span class="text-muted-foreground text-sm">
            {{ summary.groupCount }}그룹 · {{ summary.bookCount }}권
            <template v-if="summary.reclaimableSize > 0">
              · 최대 {{ formatBytes(summary.reclaimableSize) }} 절약 가능
            </template>
            <template v-if="summary.unknownSizeGroups > 0">
              <span class="opacity-70">
                ({{ summary.unknownSizeGroups }}개 그룹 용량 미상)
              </span>
            </template>
          </span>
        </template>
      </PageToolbar>

      <!-- 본문 (스크롤 영역) -->
      <div
        ref="scrollerRef"
        class="min-h-0 flex-1 overflow-y-auto pr-2"
        @wheel="handleZoomWheel"
      >
        <div v-if="status === 'pending'" class="p-4 text-center">
          <p>중복 목록을 불러오는 중...</p>
        </div>

        <div
          v-else-if="status === 'error'"
          class="text-destructive p-4 text-center"
        >
          <p>중복 목록을 불러오는 중 오류가 발생했습니다.</p>
        </div>

        <!-- 빈 상태 (중복 없음) -->
        <div
          v-else-if="groups.length === 0"
          class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <Icon
            icon="solar:check-circle-bold-duotone"
            class="h-16 w-16 opacity-50"
          />
          <p>중복된 책이 없습니다.</p>
        </div>

        <!-- 검색·필터 결과 없음 (중복 자체는 있는 상태) -->
        <div
          v-else-if="visibleGroups.length === 0"
          class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <Icon
            icon="solar:magnifer-bold-duotone"
            class="h-16 w-16 opacity-50"
          />
          <p>조건에 맞는 중복 그룹이 없습니다.</p>
        </div>

        <div v-else class="space-y-4">
          <section v-for="group in visibleGroups" :key="groupId(group)">
            <!-- 그룹 헤더. 스크롤 중에도 어느 그룹을 보고 있는지 남는다 -->
            <div
              class="bg-background sticky top-0 z-10 flex cursor-pointer items-center gap-2 py-2"
              @click="toggleCollapse(group)"
            >
              <Icon
                :icon="
                  isCollapsed(group)
                    ? 'solar:alt-arrow-right-linear'
                    : 'solar:alt-arrow-down-linear'
                "
                class="h-4 w-4 flex-shrink-0"
              />
              <Badge :variant="matchTypeBadgeVariant(group.matchType)">
                {{ matchTypeLabel(group.matchType) }}
              </Badge>
              <span class="truncate text-sm font-semibold">
                {{ groupTitle(group) }}
              </span>
              <span
                class="text-muted-foreground flex-shrink-0 text-sm whitespace-nowrap"
              >
                {{ group.books.length }}권
                <template v-if="reclaimableLabel(group)">
                  · {{ reclaimableLabel(group) }}
                </template>
              </span>
              <span
                v-if="isGroupFullySelected(group)"
                class="text-destructive ml-auto flex flex-shrink-0 items-center gap-1 text-sm font-medium whitespace-nowrap"
              >
                <Icon
                  icon="solar:danger-triangle-bold-duotone"
                  class="h-4 w-4 flex-shrink-0"
                />
                모든 책 선택됨 · 원본까지 삭제
              </span>
            </div>

            <div
              v-if="!isCollapsed(group)"
              class="grid gap-2"
              :style="{
                gridTemplateColumns: `repeat(${listCols}, minmax(0, 1fr))`,
              }"
            >
              <DuplicateBookRow
                v-for="book in group.books"
                :key="book.id"
                :book="book"
                :selected="selectedIds.has(book.id)"
                :highlight="highlightById.get(groupId(group))!"
                @toggle="toggleSelect(book.id)"
                @preview="openPreview(book)"
              />
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- 하단 고정 액션 바 -->
    <div
      class="bg-background flex items-center justify-between gap-4 border-t pt-4"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium"> {{ selectedCount }}개 선택됨 </span>
        <span
          v-if="hasFullySelectedGroup"
          class="text-destructive flex items-center gap-1 text-xs"
        >
          <Icon icon="solar:danger-triangle-bold-duotone" class="h-4 w-4" />
          원본 포함 삭제 주의
        </span>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          :disabled="selectedCount === 0 || isDeleting"
          @click="isTrashDialogOpen = true"
        >
          <Icon icon="solar:trash-bin-trash-bold-duotone" class="h-5 w-5" />
          휴지통으로 이동
        </Button>
        <Button
          variant="destructive"
          :disabled="selectedCount === 0 || isDeleting"
          @click="isPermanentDialogOpen = true"
        >
          <Icon
            icon="solar:trash-bin-minimalistic-bold-duotone"
            class="h-5 w-5"
          />
          영구 삭제
        </Button>
      </div>
    </div>

    <BookPreviewDialog
      :open="isPreviewOpen"
      :book="previewBook"
      @update:open="isPreviewOpen = $event"
    />

    <!-- 휴지통 이동 확인 다이얼로그 -->
    <AlertDialog
      :open="isTrashDialogOpen"
      @update:open="isTrashDialogOpen = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>휴지통으로 이동하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            선택한 {{ selectedCount }}개의 책을 휴지통으로 이동합니다.
            휴지통에서 복원할 수 있습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isDeleting">취소</AlertDialogCancel>
          <AlertDialogAction :disabled="isDeleting" @click="confirmTrash">
            휴지통으로 이동
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 영구 삭제 확인 다이얼로그 -->
    <AlertDialog
      :open="isPermanentDialogOpen"
      @update:open="isPermanentDialogOpen = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle class="text-destructive">
            영구적으로 삭제하시겠습니까?
          </AlertDialogTitle>
          <AlertDialogDescription>
            선택한 {{ selectedCount }}개의 책을 디스크에서 영구적으로
            삭제합니다.
            <strong class="text-destructive"
              >이 작업은 되돌릴 수 없습니다.</strong
            >
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isDeleting">취소</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive hover:bg-destructive/90 text-white"
            :disabled="isDeleting"
            @click="confirmPermanent"
          >
            영구 삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
