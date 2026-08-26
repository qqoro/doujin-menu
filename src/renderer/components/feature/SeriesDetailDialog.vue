<script setup lang="ts">
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@iconify/vue";
import { useMutation, useQuery } from "@tanstack/vue-query";
import { useDebounceFn } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type {
  Book,
  SeriesCollection,
  SeriesCollectionWithBooks,
} from "../../../types/ipc";
import {
  getSeriesCollectionById,
  removeBookFromSeries,
  reorderBooksInSeries,
  updateSeriesCollection,
} from "../../api";
import AddBookToSeriesDialog from "./AddBookToSeriesDialog.vue";
import RowCardShell from "./parts/RowCardShell.vue";

interface Props {
  open: boolean;
  /** 목록이 넘겨주는 시리즈. 책 목록은 이 컴포넌트가 따로 조회한다 */
  series: SeriesCollection | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  updated: [];
}>();

const router = useRouter();

/** 표지가 없을 때 쓰는 자리 채우기. 셸은 항상 img를 그린다 */
const COVER_PLACEHOLDER = "https://via.placeholder.com/256x384";

// 편집 모드
const isEditing = ref(false);
const editName = ref("");
const editDescription = ref("");

// 책 추가 다이얼로그
const showAddBookDialog = ref(false);

// 책 제거 확인 다이얼로그
const showRemoveDialog = ref(false);
const bookToRemove = ref<number | null>(null);

// 드래그 앤 드롭 상태
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const books = ref<Book[]>([]);

/**
 * 드래그 허용 여부.
 *
 * 행 전체에 draggable을 상수로 걸면 제목 글자를 끌어도 행이 끌려가고, 정작
 * 잡으라고 그려둔 그립은 아무 의미가 없다. 그립을 누른 순간에만 켠다.
 */
const isDragArmed = ref(false);

// 시리즈 상세 조회
const { data: seriesDetail, refetch } = useQuery({
  queryKey: computed(() => ["seriesCollection", props.series?.id]),
  // API가 any를 돌려줘서 여기서 타입을 못박는다
  queryFn: (): Promise<SeriesCollectionWithBooks | undefined> =>
    getSeriesCollectionById(props.series!.id),
  enabled: computed(() => props.open && !!props.series),
});

/**
 * 화면에 그릴 시리즈. 상세 조회 결과를 우선한다.
 *
 * props.series는 목록이 넘겨준 값이라 이름을 고쳐도 그대로다. 이걸 그리면
 * 저장 직후에도 헤더에 옛 이름이 남는다.
 */
const detail = computed<SeriesCollection | null>(
  () => seriesDetail.value ?? props.series,
);

// 시리즈가 변경되면 기존 데이터 초기화
watch(
  () => props.series?.id,
  () => {
    books.value = [];
    isEditing.value = false;
  },
);

// 시리즈 상세 데이터가 변경되면 books 배열 업데이트
watch(
  () => seriesDetail.value,
  (data) => {
    if (data?.books) {
      books.value = [...data.books];
    }
  },
  { immediate: true },
);

// 시리즈 정보 업데이트 뮤테이션
const updateMutation = useMutation({
  mutationFn: ({
    id,
    data,
  }: {
    id: number;
    data: { name?: string; description?: string };
  }) => updateSeriesCollection(id, data),
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

// 순서 변경 뮤테이션.
// 성공 토스트는 두지 않는다 — 순서가 눈앞에서 바뀌는 게 이미 피드백이고,
// 한 칸씩 옮길 때마다 토스트가 쌓인다
const reorderMutation = useMutation({
  mutationFn: ({
    seriesId,
    bookIds,
  }: {
    seriesId: number;
    bookIds: number[];
  }) => reorderBooksInSeries(seriesId, bookIds),
  onSuccess: () => {
    refetch();
    emit("updated");
  },
  onError: (error) => {
    toast.error(`순서 변경 실패: ${error.message}`);
  },
});

/**
 * 순서 저장. 화살표 연타를 한 번으로 묶는다.
 *
 * 클릭마다 저장하면 요청과 상세 재조회가 겹쳐 응답 순서가 엇갈릴 때 목록이 튄다.
 */
const saveOrder = useDebounceFn(() => {
  if (!props.series) return;
  reorderMutation.mutate({
    seriesId: props.series.id,
    bookIds: books.value.map((book) => book.id),
  });
}, 400);

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
  editName.value = detail.value?.name || "";
  editDescription.value = detail.value?.description || "";
};

// 편집 취소
const cancelEdit = () => {
  isEditing.value = false;
  editName.value = detail.value?.name || "";
  editDescription.value = detail.value?.description || "";
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

// 책 제거 요청
const handleRemoveBook = (bookId: number) => {
  bookToRemove.value = bookId;
  showRemoveDialog.value = true;
};

// 책 제거 확정
const confirmRemoveBook = () => {
  if (bookToRemove.value !== null) {
    removeBookMutation.mutate(bookToRemove.value);
    bookToRemove.value = null;
  }
  showRemoveDialog.value = false;
};

// 책 클릭 - 뷰어로 이동
const handleBookClick = (bookId: number) => {
  router.push({
    name: "Viewer",
    params: { id: bookId },
  });
  emit("update:open", false);
};

// 신뢰도 표시. 목록 카드와 같은 문구를 쓴다
const confidenceLevel = computed(() => {
  const score = detail.value?.confidence_score ?? 0;
  if (score >= 0.8) return { label: "신뢰도 높음", class: "bg-green-500/80" };
  if (score >= 0.5) return { label: "신뢰도 중간", class: "bg-yellow-500/80" };
  return { label: "신뢰도 낮음", class: "bg-red-500/80" };
});

// 생성 방식 표시
const creationType = computed(() => {
  if (detail.value?.is_manually_edited) return "수동";
  if (detail.value?.is_auto_generated) return "자동";
  return "혼합";
});

// 시리즈 표지. 없으면 첫 책의 표지로 대신한다
const seriesCoverUrl = computed(() => {
  const cover = detail.value?.cover_image || books.value[0]?.cover_path;
  return cover ? `file://${cover}` : COVER_PLACEHOLDER;
});

// 책 썸네일 URL 생성
const getCoverUrl = (book: Book) =>
  book.cover_path ? `file://${book.cover_path}` : COVER_PLACEHOLDER;

// 작가명 표시
// 참고: 시리즈 상세 API에서는 GROUP_CONCAT으로 인해 artists가 문자열로 내려옴
const getArtistNames = (book: Book) => {
  if (!book.artists) return "";
  // 배열인 경우 (일반 Book 타입)
  if (Array.isArray(book.artists)) {
    if (book.artists.length === 0) return "";
    return book.artists.map((a: { name: string }) => a.name).join(", ");
  }
  // 문자열인 경우 (GROUP_CONCAT 결과)
  const str = String(book.artists);
  return str || "";
};

// 드래그 앤 드롭 핸들러
const handleDragStart = (index: number) => {
  draggedIndex.value = index;
};

const handleDragOver = (e: DragEvent, index: number) => {
  e.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === index) {
    dragOverIndex.value = null;
    return;
  }
  dragOverIndex.value = index;
};

const handleDragLeave = () => {
  dragOverIndex.value = null;
};

const handleDragEnd = () => {
  draggedIndex.value = null;
  dragOverIndex.value = null;
  isDragArmed.value = false;
};

const handleDrop = (index: number) => {
  if (draggedIndex.value === null || draggedIndex.value === index) {
    handleDragEnd();
    return;
  }

  const newBooks = [...books.value];
  const draggedBook = newBooks[draggedIndex.value];
  newBooks.splice(draggedIndex.value, 1);
  newBooks.splice(index, 0, draggedBook);
  books.value = newBooks;

  saveOrder();
  handleDragEnd();
};

// 위/아래 버튼으로 순서 변경
const moveBook = (index: number, direction: "up" | "down") => {
  const newIndex = direction === "up" ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= books.value.length) return;

  const newBooks = [...books.value];
  const temp = newBooks[index];
  newBooks[index] = newBooks[newIndex];
  newBooks[newIndex] = temp;
  books.value = newBooks;

  saveOrder();
};

// 책 추가 완료
const handleBookAdded = () => {
  showAddBookDialog.value = false;
  refetch();
  emit("updated");
};

// 현재 시리즈에 속한 책 ID 목록
const excludeBookIds = computed(() => books.value.map((book) => book.id));
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <!-- 스크롤 영역은 하나다. 예전에는 오버레이를 스크롤시키는
         DialogScrollContent 안에 다시 ScrollArea를 넣고 높이를
         calc(85vh-120px)로 손계산해서, 헤더 높이가 바뀌면 어긋났다 -->
    <DialogContent class="flex max-h-[85vh] flex-col gap-4 sm:max-w-[860px]">
      <DialogHeader>
        <DialogTitle class="flex min-w-0 items-center gap-2 pr-8">
          <span class="truncate" :title="detail?.name">
            {{ isEditing ? "시리즈 편집" : detail?.name }}
          </span>
          <Badge variant="outline" class="shrink-0">{{ creationType }}</Badge>
          <Badge
            v-if="detail?.is_auto_generated"
            class="shrink-0 text-white"
            :class="confidenceLevel.class"
          >
            {{ confidenceLevel.label }}
          </Badge>
        </DialogTitle>
      </DialogHeader>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        <!-- 시리즈 정보 -->
        <div class="flex gap-5">
          <img
            :src="seriesCoverUrl"
            :alt="detail?.name"
            class="aspect-[2/3] w-28 shrink-0 rounded-lg object-cover shadow-md"
          />

          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <!-- 편집 중에만 라벨을 그린다. 읽기 상태에서도 띄우면 폼처럼 보인다 -->
            <template v-if="isEditing">
              <div class="space-y-1.5">
                <Label for="series-name">시리즈명</Label>
                <Input
                  id="series-name"
                  v-model="editName"
                  placeholder="시리즈 이름을 입력하세요"
                />
              </div>
              <div class="space-y-1.5">
                <Label for="series-description">설명</Label>
                <Textarea
                  id="series-description"
                  v-model="editDescription"
                  placeholder="시리즈 설명을 입력하세요 (선택사항)"
                  rows="3"
                />
              </div>
              <div class="flex justify-end gap-2">
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
            </template>

            <template v-else>
              <p class="text-muted-foreground text-sm">{{ books.length }}권</p>
              <p
                v-if="detail?.description"
                class="text-sm leading-relaxed whitespace-pre-line"
              >
                {{ detail.description }}
              </p>
              <p v-else class="text-muted-foreground text-sm italic">
                설명 없음
              </p>
              <div class="mt-auto flex justify-end">
                <Button variant="outline" size="sm" @click="startEdit">
                  <Icon icon="solar:pen-bold-duotone" class="h-4 w-4" />
                  편집
                </Button>
              </div>
            </template>
          </div>
        </div>

        <!-- 소속 책 목록.
             제목 줄은 sticky라 목록을 내려도 "책 추가"에 계속 닿는다 -->
        <div
          class="bg-popover sticky top-0 z-10 mt-6 flex items-center justify-between py-2"
        >
          <h3 class="font-semibold">소속 책 ({{ books.length }}권)</h3>
          <Button variant="outline" size="sm" @click="showAddBookDialog = true">
            <Icon icon="solar:add-circle-bold-duotone" class="h-4 w-4" />
            책 추가
          </Button>
        </div>

        <div class="space-y-1">
          <template v-for="(book, index) in books" :key="book.id">
            <!-- 드롭 위치 표시줄 -->
            <div
              v-if="
                dragOverIndex === index &&
                draggedIndex !== null &&
                draggedIndex !== index
              "
              class="bg-primary h-0.5 rounded-full transition-all"
            />

            <div
              class="group flex items-stretch gap-2"
              :class="{ 'opacity-40': draggedIndex === index }"
              :draggable="isDragArmed"
              @dragstart="handleDragStart(index)"
              @dragover="handleDragOver($event, index)"
              @dragleave="handleDragLeave"
              @drop="handleDrop(index)"
              @dragend="handleDragEnd"
            >
              <!-- 순서 열. 번호·화살표·그립을 한쪽에 모은다 -->
              <div
                class="flex w-8 shrink-0 flex-col items-center justify-center gap-0.5"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-5 w-5"
                  :disabled="index === 0"
                  aria-label="위로 이동"
                  @click="moveBook(index, 'up')"
                >
                  <Icon
                    icon="solar:alt-arrow-up-bold-duotone"
                    class="h-3.5 w-3.5"
                  />
                </Button>
                <span class="text-muted-foreground text-xs font-semibold">
                  {{ index + 1 }}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-5 w-5"
                  :disabled="index === books.length - 1"
                  aria-label="아래로 이동"
                  @click="moveBook(index, 'down')"
                >
                  <Icon
                    icon="solar:alt-arrow-down-bold-duotone"
                    class="h-3.5 w-3.5"
                  />
                </Button>
                <div
                  class="text-muted-foreground mt-1 cursor-grab active:cursor-grabbing"
                  title="끌어서 순서 변경"
                  @mousedown="isDragArmed = true"
                  @mouseup="isDragArmed = false"
                >
                  <Icon
                    icon="solar:hamburger-menu-bold-duotone"
                    class="h-4 w-4"
                  />
                </div>
              </div>

              <RowCardShell
                class="min-w-0 flex-1"
                :cover-url="getCoverUrl(book)"
                :alt="book.title"
                @click="handleBookClick(book.id)"
              >
                <template #content>
                  <h4
                    class="text-sm leading-snug font-semibold"
                    :title="book.title"
                  >
                    {{ book.title }}
                  </h4>
                  <div
                    class="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
                  >
                    <span
                      v-if="getArtistNames(book)"
                      class="flex items-center gap-1"
                    >
                      <Icon icon="solar:user-bold-duotone" class="h-3 w-3" />
                      {{ getArtistNames(book) }}
                    </span>
                    <span
                      v-if="book.page_count"
                      class="flex items-center gap-1"
                    >
                      <Icon
                        icon="solar:document-text-bold-duotone"
                        class="h-3 w-3"
                      />
                      {{ book.page_count }}페이지
                    </span>
                  </div>
                </template>

                <!-- 항상 보이게 둔다. 호버로만 나타나면 키보드로는 닿을 수 없다 -->
                <template #actions>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground hover:text-destructive self-center"
                    aria-label="시리즈에서 제거"
                    @click.stop="handleRemoveBook(book.id)"
                  >
                    <Icon
                      icon="solar:trash-bin-trash-bold-duotone"
                      class="h-4 w-4"
                    />
                  </Button>
                </template>
              </RowCardShell>
            </div>
          </template>

          <div
            v-if="books.length === 0"
            class="text-muted-foreground py-8 text-center"
          >
            이 시리즈에 속한 책이 없습니다
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- 책 추가 다이얼로그 -->
  <AddBookToSeriesDialog
    v-model:open="showAddBookDialog"
    :series-id="series?.id || null"
    :exclude-book-ids="excludeBookIds"
    @added="handleBookAdded"
  />

  <!-- 책 제거 확인 다이얼로그 -->
  <AlertDialog
    :open="showRemoveDialog"
    @update:open="showRemoveDialog = $event"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>시리즈에서 책 제거</AlertDialogTitle>
        <AlertDialogDescription>
          이 책을 시리즈에서 제거하시겠습니까? 책 자체는 삭제되지 않고
          시리즈에서만 제거됩니다.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction @click="confirmRemoveBook">제거</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
