<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icon } from "@iconify/vue";
import { ref, watch, computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import {
  getSeriesCollectionById,
  updateSeriesCollection,
  removeBookFromSeries,
  reorderBooksInSeries,
} from "../../api";
import type { SeriesCollectionWithBooks } from "../../../main/db/types";

interface Props {
  open: boolean;
  series: SeriesCollectionWithBooks | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  updated: [];
}>();

const queryClient = useQueryClient();
const router = useRouter();

// 편집 모드
const isEditing = ref(false);
const editName = ref("");
const editDescription = ref("");

// 시리즈 상세 조회
const { data: seriesDetail, refetch } = useQuery({
  queryKey: computed(() => ["seriesCollection", props.series?.id]),
  queryFn: () => getSeriesCollectionById(props.series!.id),
  enabled: computed(() => props.open && !!props.series),
});

// 시리즈 정보 업데이트 뮤테이션
const updateMutation = useMutation({
  mutationFn: ({ id, data }: { id: number; data: any }) =>
    updateSeriesCollection(id, data),
  onSuccess: () => {
    toast.success("시리즈 정보가 업데이트되었습니다");
    isEditing.value = false;
    refetch();
    emit("updated");
  },
  onError: (error) => {
    toast.error(`업데이트 실패: ${error.message}`);
  },
});

// 책 제거 뮤테이션
const removeBookMutation = useMutation({
  mutationFn: removeBookFromSeries,
  onSuccess: () => {
    toast.success("책이 시리즈에서 제거되었습니다");
    refetch();
    emit("updated");
  },
  onError: (error) => {
    toast.error(`제거 실패: ${error.message}`);
  },
});

// props.series 변경 시 편집 폼 초기화
watch(
  () => props.series,
  (newSeries) => {
    if (newSeries) {
      editName.value = newSeries.name;
      editDescription.value = newSeries.description || "";
    }
  },
  { immediate: true },
);

// 편집 시작
const startEdit = () => {
  isEditing.value = true;
  editName.value = props.series?.name || "";
  editDescription.value = props.series?.description || "";
};

// 편집 취소
const cancelEdit = () => {
  isEditing.value = false;
  editName.value = props.series?.name || "";
  editDescription.value = props.series?.description || "";
};

// 저장
const saveEdit = () => {
  if (!props.series) return;

  updateMutation.mutate({
    id: props.series.id,
    data: {
      name: editName.value,
      description: editDescription.value || undefined,
    },
  });
};

// 책 제거
const handleRemoveBook = (bookId: number) => {
  if (confirm("이 책을 시리즈에서 제거하시겠습니까?")) {
    removeBookMutation.mutate(bookId);
  }
};

// 책 클릭 - 뷰어로 이동
const handleBookClick = (bookId: number) => {
  router.push({
    name: "Viewer",
    params: { id: bookId },
  });
  emit("update:open", false);
};

// 다이얼로그 닫기
const closeDialog = () => {
  isEditing.value = false;
  emit("update:open", false);
};

// 신뢰도 표시
const confidenceLevel = computed(() => {
  if (!props.series) return { label: "", class: "" };
  const score = props.series.confidence_score;
  if (score >= 0.8) return { label: "높음", class: "bg-green-500" };
  if (score >= 0.5) return { label: "중간", class: "bg-yellow-500" };
  return { label: "낮음", class: "bg-red-500" };
});
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[85vh] max-w-[700px] flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center justify-between">
          <span>시리즈 상세</span>
          <div class="flex items-center gap-2">
            <!-- 생성 방식 -->
            <span class="bg-secondary rounded px-2 py-1 text-xs">
              {{ series?.is_manually_edited ? "수동" : "자동" }}
            </span>
            <!-- 신뢰도 -->
            <span
              v-if="series?.is_auto_generated"
              class="rounded px-2 py-1 text-xs text-white"
              :class="confidenceLevel.class"
            >
              {{ confidenceLevel.label }}
            </span>
          </div>
        </DialogTitle>
      </DialogHeader>

      <ScrollArea class="-mx-6 flex-1 px-6">
        <div class="space-y-6 pr-4 pb-4">
          <!-- 시리즈 정보 편집 -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">시리즈 정보</h3>
              <Button
                v-if="!isEditing"
                variant="outline"
                size="sm"
                @click="startEdit"
              >
                <Icon icon="solar:pen-bold-duotone" class="mr-2 h-4 w-4" />
                편집
              </Button>
              <div v-else class="flex gap-2">
                <Button variant="outline" size="sm" @click="cancelEdit">
                  취소
                </Button>
                <Button
                  size="sm"
                  :disabled="updateMutation.isPending.value"
                  @click="saveEdit"
                >
                  저장
                </Button>
              </div>
            </div>

            <!-- 이름 -->
            <div class="space-y-2">
              <Label>시리즈명</Label>
              <Input
                v-if="isEditing"
                v-model="editName"
                placeholder="시리즈 이름을 입력하세요"
              />
              <div v-else class="text-lg font-semibold">
                {{ series?.name }}
              </div>
            </div>

            <!-- 설명 -->
            <div class="space-y-2">
              <Label>설명</Label>
              <Textarea
                v-if="isEditing"
                v-model="editDescription"
                placeholder="시리즈 설명을 입력하세요 (선택사항)"
                rows="3"
              />
              <div
                v-else-if="series?.description"
                class="text-muted-foreground text-sm"
              >
                {{ series.description }}
              </div>
              <div v-else class="text-muted-foreground text-sm italic">
                설명 없음
              </div>
            </div>
          </div>

          <!-- 소속 책 목록 -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">
                소속 책 ({{ seriesDetail?.books.length || 0 }}권)
              </h3>
            </div>

            <div class="space-y-2">
              <div
                v-for="book in seriesDetail?.books"
                :key="book.id"
                class="hover:bg-accent group flex items-center gap-3 rounded-lg border p-3"
              >
                <!-- 순서 -->
                <div
                  class="bg-primary/10 text-primary flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                >
                  {{ book.series_order_index }}
                </div>

                <!-- 책 정보 (클릭 가능) -->
                <div
                  class="min-w-0 flex-1 cursor-pointer"
                  @click="handleBookClick(book.id)"
                >
                  <div
                    class="hover:text-primary truncate font-medium transition-colors"
                  >
                    {{ book.title }}
                  </div>
                  <div class="text-muted-foreground text-xs">
                    {{ book.page_count }}페이지
                  </div>
                </div>

                <!-- 제거 버튼 -->
                <Button
                  variant="ghost"
                  size="icon"
                  class="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  @click.stop="handleRemoveBook(book.id)"
                >
                  <Icon
                    icon="solar:trash-bin-trash-bold-duotone"
                    class="text-destructive h-4 w-4"
                  />
                </Button>
              </div>

              <div
                v-if="!seriesDetail?.books || seriesDetail.books.length === 0"
                class="text-muted-foreground py-8 text-center"
              >
                이 시리즈에 속한 책이 없습니다
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
