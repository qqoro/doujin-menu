<script setup lang="ts">
import * as api from "@/api";
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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"; // ContextMenu 관련 컴포넌트 임포트
import { Icon } from "@iconify/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref, toRaw } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import ContextMenuSeparator from "../ui/context-menu/ContextMenuSeparator.vue";
import { useTagDisplay } from "@/composable/useTagDisplay";
import type { Book } from "../../../types/ipc";

const props = defineProps<{
  book: Book;
  queryKey: readonly unknown[];
  hideTags?: boolean;
  externalImageViewerPath?: string;
  externalArchiveViewerPath?: string;
}>();
const emit = defineEmits([
  "selectTag",
  "excludeTag",
  "selectArtist",
  "selectGroup",
  "toggle-favorite",
  "open-book-folder",
  "show-details",
  "show-preview",
]);

const router = useRouter();
const { getTagDisplayInfo } = useTagDisplay();

const viewerLink = computed(() => ({
  name: "Viewer",
  params: { id: props.book.id },
  query: {
    filter: JSON.stringify(toRaw(props.queryKey[1])),
  },
}));

const openInNewWindow = () => {
  const url = `/viewer/${viewerLink.value.params.id}?${new URLSearchParams(viewerLink.value.query).toString()}`;
  api.openNewWindow(url);
};

const handleCardClick = (event: MouseEvent) => {
  if (event.ctrlKey || event.metaKey) {
    // metaKey for Command key on macOS
    openInNewWindow();
  } else {
    router.push(viewerLink.value);
  }
};

const thumbnailKey = ref(0);

// 태그 영역 펼침 상태
const isTagsExpanded = ref(false);

const coverUrl = computed(() => {
  if (!props.book.cover_path) return "";
  return thumbnailKey.value
    ? `file://${props.book.cover_path}?v=${thumbnailKey.value}`
    : `file://${props.book.cover_path}`;
});

const handleTagClick = (tag: { name: string }) => {
  emit("selectTag", tag.name);
};

const handleArtistClick = (artist: { name: string }) => {
  emit("selectArtist", artist.name);
};

const handleGroupClick = (group: { name: string }) => {
  emit("selectGroup", group.name);
};

// 유효한 작가 목록 (빈 문자열, null, undefined 제외)
const validArtists = computed(() => {
  return (
    props.book.artists?.filter((a) => a.name && a.name.trim() !== "") || []
  );
});

// 유효한 그룹 목록 (빈 문자열, null, undefined 제외)
const validGroups = computed(() => {
  return props.book.groups?.filter((g) => g.name && g.name.trim() !== "") || [];
});

// 작가 또는 그룹 정보가 있는지 확인
const hasCreatorInfo = computed(() => {
  return validArtists.value.length > 0 || validGroups.value.length > 0;
});

const toggleFavorite = () => {
  emit("toggle-favorite", props.book.id, props.book.is_favorite);
};

const openBookFolder = () => {
  emit("open-book-folder", props.book.path);
};

// 외부 뷰어 설정 여부 확인 (아카이브/폴더 유형에 따라 다른 뷰어 경로 사용)
const hasExternalViewer = computed(() => {
  const bookPath = props.book.path || "";
  const isArchive = /\.(cbz|zip)$/i.test(bookPath);
  if (isArchive) {
    return !!props.externalArchiveViewerPath;
  }
  return !!props.externalImageViewerPath;
});

// 외부 프로그램으로 책 열기
const openWithExternalViewer = async () => {
  try {
    await api.openBookWithExternalViewer(props.book.id);
    toast.success("외부 프로그램으로 열었습니다.");
  } catch (error) {
    toast.error("외부 프로그램 실행 실패", {
      description: (error as Error).message,
    });
  }
};

const isDeleteDialogOpen = ref(false);

const queryClient = useQueryClient();

const isRescanning = ref(false);

const handleRescanMetadata = async () => {
  if (isRescanning.value) return;
  isRescanning.value = true;
  try {
    await api.rescanBookMetadata(props.book.id);
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    thumbnailKey.value = Date.now();
    toast.success("메타데이터 재스캔 완료", {
      description: `${props.book.title}의 메타데이터가 갱신되었습니다.`,
    });
  } catch (error) {
    console.error("메타데이터 재스캔 실패:", error);
    toast.error("재스캔 실패", {
      description: "메타데이터를 갱신하는 중 오류가 발생했습니다.",
    });
  } finally {
    isRescanning.value = false;
  }
};

const handleDeleteBook = async () => {
  isDeleteDialogOpen.value = true;
};

const confirmDeleteBook = async () => {
  try {
    // Call the main process to delete the book
    await api.deleteBook(props.book.id);
    toast.success("책 삭제 완료", {
      description: `${props.book.title}이(가) 삭제되었습니다.`,
    });
    queryClient.invalidateQueries({ queryKey: ["books"] }); // Invalidate the query
  } catch (error) {
    console.error("책 삭제 실패:", error);
    toast.error("책 삭제 실패", {
      description: "책을 삭제하는 중 오류가 발생했습니다.",
    });
  } finally {
    isDeleteDialogOpen.value = false;
  }
};
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger>
      <Card
        class="flex h-full cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg"
        @click="handleCardClick"
      >
        <CardContent class="p-0">
          <img
            :src="coverUrl"
            :alt="book.title"
            class="aspect-[2/3] h-auto w-full object-cover"
          />
        </CardContent>
        <CardFooter class="flex-grow flex-col items-start gap-1 p-2">
          <p class="w-full truncate text-sm font-semibold" :title="book.title">
            {{ book.title }}
          </p>
          <!-- 작가/그룹 정보 -->
          <p
            v-if="!hasCreatorInfo"
            class="text-muted-foreground w-full truncate text-xs"
          >
            작가 정보 없음
          </p>
          <div
            v-if="hasCreatorInfo"
            class="text-muted-foreground flex w-full items-center gap-2 text-xs"
          >
            <div
              v-if="validArtists.length > 0"
              class="flex min-w-0 shrink-0 items-center gap-1"
            >
              <Icon
                icon="solar:user-bold-duotone"
                class="h-3 w-3 flex-shrink-0"
              />
              <span
                class="cursor-pointer truncate hover:underline"
                :title="validArtists.map((a) => a.name).join(', ')"
                @click.prevent.stop="handleArtistClick(validArtists[0])"
              >
                {{ validArtists.map((a) => a.name).join(", ") }}
              </span>
            </div>
            <div
              v-if="validGroups.length > 0"
              class="flex min-w-0 items-center gap-1 overflow-hidden"
            >
              <Icon
                icon="solar:users-group-rounded-bold-duotone"
                class="h-3 w-3 flex-shrink-0"
              />
              <span
                class="cursor-pointer truncate hover:underline"
                :title="validGroups.map((g) => g.name).join(', ')"
                @click.prevent.stop="handleGroupClick(validGroups[0])"
              >
                {{ validGroups.map((g) => g.name).join(", ") }}
              </span>
            </div>
          </div>
          <!-- 태그 영역: 기본 한 줄 (overflow hidden), + 버튼으로 펼치기 -->
          <div
            v-if="!hideTags && book.tags?.length"
            class="flex w-full items-start gap-1"
            :class="
              isTagsExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'
            "
          >
            <div
              class="flex min-w-0 flex-1 items-center gap-1"
              :class="
                isTagsExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'
              "
            >
              <Badge
                v-for="tag in book.tags"
                :key="tag.name"
                :class="getTagDisplayInfo(tag).className"
                class="flex-shrink-0"
                @click.prevent.stop="handleTagClick(tag)"
                @contextmenu.prevent.stop="emit('excludeTag', tag.name)"
              >
                {{ getTagDisplayInfo(tag).displayText }}
              </Badge>
            </div>
            <button
              v-if="book.tags.length > 1"
              class="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
              @click.prevent.stop="isTagsExpanded = !isTagsExpanded"
            >
              <Icon
                :icon="
                  isTagsExpanded
                    ? 'solar:minus-circle-bold-duotone'
                    : 'solar:add-circle-bold-duotone'
                "
                class="h-[22px] w-[22px]"
              />
            </button>
          </div>
        </CardFooter>
      </Card>
    </ContextMenuTrigger>

    <ContextMenuContent>
      <ContextMenuItem @click="toggleFavorite">
        <Icon
          :icon="
            book.is_favorite
              ? 'solar:heart-broken-line-duotone'
              : 'solar:heart-bold-duotone'
          "
          class="h-4 w-4"
        />
        {{ book.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가" }}
      </ContextMenuItem>
      <ContextMenuItem @click="openBookFolder">
        <Icon icon="solar:folder-open-bold-duotone" class="h-4 w-4" />
        폴더 열기
      </ContextMenuItem>
      <ContextMenuItem @click="openInNewWindow">
        <Icon icon="solar:square-top-down-bold-duotone" class="h-4 w-4" />
        새 창으로 열기
      </ContextMenuItem>
      <ContextMenuItem v-if="hasExternalViewer" @click="openWithExternalViewer">
        <Icon icon="solar:monitor-bold-duotone" class="h-4 w-4" />
        외부 프로그램으로 열기
      </ContextMenuItem>
      <ContextMenuItem @click="emit('show-details', book)">
        <Icon icon="solar:info-circle-bold-duotone" class="h-4 w-4" />
        상세 정보
      </ContextMenuItem>
      <ContextMenuItem @click.stop="emit('show-preview', book)">
        <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
        미리보기
      </ContextMenuItem>
      <ContextMenuItem @click.stop="handleRescanMetadata">
        <Icon
          icon="solar:refresh-bold-duotone"
          class="h-4 w-4"
          :class="{ 'animate-spin': isRescanning }"
        />
        메타데이터 재스캔
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @click="handleDeleteBook">
        <Icon icon="solar:trash-bin-trash-bold-duotone" class="h-4 w-4" />
        삭제
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <AlertDialog
    :open="isDeleteDialogOpen"
    @update:open="isDeleteDialogOpen = $event"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>책을 삭제하시겠습니까?</AlertDialogTitle>
        <AlertDialogDescription>
          이 작업은 되돌릴 수 없습니다. 데이터베이스에서 책 정보가 삭제되고,
          물리 파일도 영구적으로 삭제됩니다.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction @click="confirmDeleteBook">삭제</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
