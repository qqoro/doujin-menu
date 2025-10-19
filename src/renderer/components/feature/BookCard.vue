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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Icon } from "@iconify/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref, toRaw } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import ContextMenuSeparator from "../ui/context-menu/ContextMenuSeparator.vue";
import { useTagDisplay } from "@/composable/useTagDisplay";

interface Tag {
  name: string;
}

interface Artist {
  name: string;
}

interface Group {
  name: string;
}

interface Book {
  id: number;
  title: string;
  cover_path: string | null;
  tags: Tag[];
  artists: Artist[];
  groups: Group[];
  is_favorite: boolean;
  path: string;
}

const props = defineProps<{ book: Book; queryKey: readonly unknown[] }>();
const emit = defineEmits([
  "selectTag",
  "selectArtist",
  "selectGroup",
  "toggle-favorite",
  "open-book-folder",
  "show-details", // 상세 정보 이벤트를 추가합니다.
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

const MAX_VISIBLE_TAGS = 3;

const coverUrl = computed(() => {
  return props.book.cover_path ? `file://${props.book.cover_path}` : "";
});

const visibleTags = computed(() => {
  if (!props.book.tags) return [];
  return props.book.tags.slice(0, MAX_VISIBLE_TAGS);
});

const hiddenTagsCount = computed(() => {
  if (!props.book.tags) return 0;
  return props.book.tags.length - MAX_VISIBLE_TAGS;
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
  return props.book.artists?.filter(
    (a) => a.name && a.name.trim() !== ""
  ) || [];
});

// 유효한 그룹 목록 (빈 문자열, null, undefined 제외)
const validGroups = computed(() => {
  return props.book.groups?.filter(
    (g) => g.name && g.name.trim() !== ""
  ) || [];
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

const isDeleteDialogOpen = ref(false);

const queryClient = useQueryClient();

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
        class="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full py-0 gap-0 cursor-pointer"
        @click="handleCardClick"
      >
        <CardContent class="p-0">
          <img
            :src="coverUrl"
            :alt="book.title"
            class="aspect-[2/3] w-full h-auto object-cover"
          />
        </CardContent>
        <CardFooter class="p-2 flex-col items-start flex-grow gap-1">
          <p class="font-semibold text-sm truncate w-full" :title="book.title">
            {{ book.title }}
          </p>
          <!-- 작가 정보가 없는 경우 -->
          <p
            v-if="!hasCreatorInfo"
            class="text-xs text-muted-foreground truncate w-full"
          >
            작가 정보 없음
          </p>
          <!-- 작가 정보 -->
          <div
            v-if="validArtists.length > 0"
            class="flex items-center gap-1 w-full text-xs text-muted-foreground"
          >
            <Icon icon="solar:user-bold-duotone" class="w-3 h-3 flex-shrink-0" />
            <span
              class="truncate cursor-pointer hover:underline"
              :title="validArtists.map((a) => a.name).join(', ')"
              @click.prevent.stop="handleArtistClick(validArtists[0])"
            >
              {{ validArtists.map((a) => a.name).join(", ") }}
            </span>
          </div>
          <!-- 그룹 정보 -->
          <div
            v-if="validGroups.length > 0"
            class="flex items-center gap-1 w-full text-xs text-muted-foreground"
          >
            <Icon icon="solar:users-group-rounded-bold-duotone" class="w-3 h-3 flex-shrink-0" />
            <span
              class="truncate cursor-pointer hover:underline"
              :title="validGroups.map((g) => g.name).join(', ')"
              @click.prevent.stop="handleGroupClick(validGroups[0])"
            >
              {{ validGroups.map((g) => g.name).join(", ") }}
            </span>
          </div>
          <div class="flex flex-wrap items-start gap-1 w-full min-h-[42px]">
            <Badge
              v-for="tag in visibleTags"
              :key="tag.name"
              :class="getTagDisplayInfo(tag).className"
              @click.prevent.stop="handleTagClick(tag)"
            >
              {{ getTagDisplayInfo(tag).displayText }}
            </Badge>
            <TooltipProvider v-if="hiddenTagsCount > 0" :delay-duration="100">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Badge
                    variant="secondary"
                    class="cursor-pointer"
                    @click.prevent.stop
                  >
                    +{{ hiddenTagsCount }}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  class="max-w-[300px] p-2 bg-primary/50 backdrop-blur-md"
                  @click.prevent.stop
                >
                  <div class="flex flex-wrap gap-1">
                    <Badge
                      v-for="tag in book.tags"
                      :key="`tooltip-${tag}`"
                      :class="getTagDisplayInfo(tag).className"
                      @click.prevent.stop="handleTagClick(tag)"
                    >
                      {{ getTagDisplayInfo(tag).displayText }}
                    </Badge>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
          class="w-4 h-4"
        />
        {{ book.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가" }}
      </ContextMenuItem>
      <ContextMenuItem @click="openBookFolder">
        <Icon icon="solar:folder-open-bold-duotone" class="w-4 h-4" />
        폴더 열기
      </ContextMenuItem>
      <ContextMenuItem @click="openInNewWindow">
        <Icon icon="solar:square-top-down-bold-duotone" class="w-4 h-4" />
        새 창으로 열기
      </ContextMenuItem>
      <ContextMenuItem @click="emit('show-details', book)">
        <Icon icon="solar:info-circle-bold-duotone" class="w-4 h-4" />
        상세 정보
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @click="handleDeleteBook">
        <Icon icon="solar:trash-bin-trash-bold-duotone" class="w-4 h-4" />
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
