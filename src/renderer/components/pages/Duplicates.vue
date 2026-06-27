<script setup lang="ts">
import { deleteDuplicateBooks, getDuplicateGroups } from "@/api";
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
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@iconify/vue";
import PageHeader from "../layout/PageHeader.vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import type { DuplicateGroup } from "../../../types/ipc";

const queryClient = useQueryClient();

// 중복 그룹 목록 조회
const { data, status } = useQuery<DuplicateGroup[]>({
  queryKey: ["duplicateGroups"],
  queryFn: getDuplicateGroups,
});

const groups = computed(() => data.value ?? []);

// 선택된 책 ID 집합 (반응성 보장을 위해 토글 시 new Set으로 교체)
const selectedIds = ref<Set<number>>(new Set());

// 삭제 진행 중 여부
const isDeleting = ref(false);

// 확인 다이얼로그 상태
const isTrashDialogOpen = ref(false);
const isPermanentDialogOpen = ref(false);

// 커버 이미지 URL (없으면 placeholder)
const getCoverUrl = (coverPath: string | null) => {
  return coverPath
    ? `file://${coverPath}`
    : "https://via.placeholder.com/256x384";
};

// 매치 타입 라벨
const getMatchTypeLabel = (matchType: DuplicateGroup["matchType"]) => {
  return matchType === "hitomi_id" ? "ID 일치" : "제목 일치";
};

// 선택 토글 (오프라인 책은 호출되지 않음 — 체크박스 비활성화)
const toggleSelect = (bookId: number) => {
  const next = new Set(selectedIds.value);
  if (next.has(bookId)) {
    next.delete(bookId);
  } else {
    next.add(bookId);
  }
  selectedIds.value = next;
};

const isSelected = (bookId: number) => selectedIds.value.has(bookId);

// 선택 개수
const selectedCount = computed(() => selectedIds.value.size);

// 그룹 전체가 선택되었는지 여부 (원본까지 전부 삭제 — 경고 대상)
const isGroupFullySelected = (group: DuplicateGroup) => {
  return group.books.every((book) => selectedIds.value.has(book.id));
};

// 전체 선택 중 그룹 전부 선택된 그룹이 하나라도 있는지
const hasFullySelectedGroup = computed(() => {
  return groups.value.some(
    (group) => group.books.length > 0 && isGroupFullySelected(group),
  );
});

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
  <div class="flex h-full flex-col gap-6">
    <PageHeader icon="solar:copy-bold-duotone" title="중복 정리" />

    <!-- 본문 (스크롤 영역) -->
    <div class="flex-grow overflow-y-auto pr-4">
      <!-- 로딩 -->
      <div v-if="status === 'pending'" class="p-4 text-center">
        <p>중복 목록을 불러오는 중...</p>
      </div>

      <!-- 에러 -->
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

      <!-- 중복 그룹 목록 -->
      <div v-else class="space-y-4">
        <Card v-for="group in groups" :key="group.key" class="p-4">
          <!-- 그룹 헤더 (전체 선택 경고를 같은 줄에 표시해 본문 레이아웃 시프팅 방지) -->
          <div class="mb-3 flex items-center gap-2">
            <Badge
              :variant="
                group.matchType === 'hitomi_id' ? 'default' : 'secondary'
              "
            >
              {{ getMatchTypeLabel(group.matchType) }}
            </Badge>
            <span class="text-muted-foreground text-sm">
              {{ group.books.length }}개의 책
            </span>
            <span
              v-if="isGroupFullySelected(group)"
              class="text-destructive ml-auto flex items-center gap-1 text-sm font-medium whitespace-nowrap"
            >
              <Icon
                icon="solar:danger-triangle-bold-duotone"
                class="h-4 w-4 flex-shrink-0"
              />
              모든 책 선택됨 · 원본까지 삭제
            </span>
          </div>

          <!-- 그룹 내 책 목록 -->
          <div class="space-y-2">
            <div
              v-for="book in group.books"
              :key="book.id"
              :class="[
                'flex items-center gap-3 rounded-md p-2 transition-colors select-none',
                book.is_offline
                  ? 'cursor-not-allowed opacity-70'
                  : 'cursor-pointer',
                isSelected(book.id) ? 'bg-accent/40' : 'hover:bg-accent/20',
              ]"
              @click="!book.is_offline && toggleSelect(book.id)"
            >
              <!-- 체크박스 (오프라인 책은 비활성화). 행 전체 클릭으로 토글되므로 체크박스 직접 클릭은 전파를 막아 이중 토글을 방지 -->
              <Checkbox
                :model-value="isSelected(book.id)"
                :disabled="book.is_offline"
                @click.stop="!book.is_offline && toggleSelect(book.id)"
              />

              <!-- 커버 (오프라인/파일 접근 불가 시 placeholder로 폴백) -->
              <img
                :src="getCoverUrl(book.cover_path)"
                :alt="book.title"
                class="h-20 w-16 flex-shrink-0 rounded-md object-cover"
                @error="
                  ($event.target as HTMLImageElement).src =
                    'https://via.placeholder.com/256x384'
                "
              />

              <!-- 정보 -->
              <div class="min-w-0 flex-grow">
                <div class="flex items-center gap-2">
                  <p class="truncate font-semibold">{{ book.title }}</p>
                  <Badge
                    v-if="book.is_offline"
                    variant="outline"
                    class="flex-shrink-0"
                  >
                    오프라인
                  </Badge>
                  <Icon
                    v-if="book.is_favorite"
                    icon="solar:heart-bold"
                    class="text-destructive h-4 w-4 flex-shrink-0"
                  />
                </div>
                <p class="text-muted-foreground truncate text-xs">
                  {{ book.path }}
                </p>
                <div
                  class="text-muted-foreground mt-1 flex items-center gap-3 text-xs"
                >
                  <span v-if="book.page_count !== null">
                    {{ book.page_count }}페이지
                  </span>
                  <span class="flex items-center gap-1">
                    <Icon
                      :icon="
                        book.isArchive
                          ? 'solar:archive-bold-duotone'
                          : 'solar:folder-bold-duotone'
                      "
                      class="h-3.5 w-3.5"
                    />
                    {{ book.isArchive ? "압축파일" : "폴더" }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
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
