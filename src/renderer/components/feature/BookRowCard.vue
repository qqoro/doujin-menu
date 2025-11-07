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
import { Button } from "@/components/ui/button";
import { useTagDisplay } from "@/composable/useTagDisplay";
import { Icon } from "@iconify/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref, toRaw } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type { Book } from "../../../types/ipc";

const props = defineProps<{ book: Book; queryKey: readonly unknown[] }>();
const emit = defineEmits([
  "selectTag",
  "selectArtist",
  "selectGroup",
  "selectSeries",
  "selectCharacter",
  "toggle-favorite",
  "open-book-folder",
  "show-details",
]);

const router = useRouter();
const queryClient = useQueryClient();
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
    openInNewWindow();
  } else {
    router.push(viewerLink.value);
  }
};

const coverUrl = computed(() => {
  return props.book.cover_path ? `file://${props.book.cover_path}` : "";
});

const validArtists = computed(() => {
  return (
    props.book.artists?.filter((a) => a.name && a.name.trim() !== "") || []
  );
});

const validGroups = computed(() => {
  return props.book.groups?.filter((g) => g.name && g.name.trim() !== "") || [];
});

const validSeries = computed(() => {
  return props.book.series?.filter((s) => s.name && s.name.trim() !== "") || [];
});

const validCharacters = computed(() => {
  return (
    props.book.characters?.filter((c) => c.name && c.name.trim() !== "") || []
  );
});

const toggleFavorite = () => {
  emit("toggle-favorite", props.book.id, props.book.is_favorite);
};

const openBookFolder = () => {
  emit("open-book-folder", props.book.path);
};

const isDeleteDialogOpen = ref(false);

const handleDeleteBook = async () => {
  isDeleteDialogOpen.value = true;
};

const confirmDeleteBook = async () => {
  try {
    await api.deleteBook(props.book.id);
    toast.success("책 삭제 완료", {
      description: `${props.book.title}이(가) 삭제되었습니다.`,
    });
    queryClient.invalidateQueries({ queryKey: ["books"] });
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
  <div
    class="flex items-center p-2 border-b hover:bg-muted/50 transition-colors cursor-pointer"
    @click="handleCardClick"
  >
    <div class="w-48 h-64 mr-4 flex-shrink-0 overflow-hidden relative">
      <img
        :src="coverUrl"
        :alt="book.title"
        class="w-full h-full object-cover rounded-md transition-transform duration-300 hover:scale-110"
      />
      <div
        v-if="book.is_favorite"
        class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
      >
        <Icon icon="solar:heart-bold" class="w-5 h-5" />
      </div>
    </div>
    <div class="flex-1 flex flex-col gap-2">
      <!-- 제목 -->
      <h3 class="font-bold text-lg">{{ book.title }}</h3>
      <!-- 작가/그룹/시리즈/캐릭터/페이지 -->
      <div class="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <p>
          <Icon
            icon="solar:pen-new-round-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          작가:
          <template v-if="validArtists.length > 0">
            <template
              v-for="(artist, index) in validArtists"
              :key="artist.name"
            >
              <button
                class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
                @click.stop="emit('selectArtist', artist.name)"
              >
                {{ artist.name }}
              </button>
              <span v-if="index < validArtists.length - 1">, </span>
            </template>
          </template>
          <template v-else> 알 수 없음 </template>
        </p>
        <!-- 그룹 -->
        <p v-if="validGroups.length > 0">
          <Icon
            icon="solar:users-group-rounded-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          그룹:
          <template v-for="(group, index) in validGroups" :key="group.name">
            <button
              class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
              @click.stop="emit('selectGroup', group.name)"
            >
              {{ group.name }}
            </button>
            <span v-if="index < validGroups.length - 1">, </span>
          </template>
        </p>
        <!-- 시리즈 -->
        <p v-if="validSeries.length > 0">
          <Icon
            icon="solar:bookmark-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          시리즈:
          <template v-for="(series, index) in validSeries" :key="series.name">
            <button
              class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
              @click.stop="emit('selectSeries', series.name)"
            >
              {{ series.name }}
            </button>
            <span v-if="index < validSeries.length - 1">, </span>
          </template>
        </p>
        <!-- 캐릭터 -->
        <p v-if="validCharacters.length > 0">
          <Icon
            icon="solar:user-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          캐릭터:
          <template
            v-for="(character, index) in validCharacters"
            :key="character.name"
          >
            <button
              class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
              @click.stop="emit('selectCharacter', character.name)"
            >
              {{ character.name }}
            </button>
            <span v-if="index < validCharacters.length - 1">, </span>
          </template>
        </p>
        <p>
          <Icon
            icon="solar:document-text-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          {{ book.page_count || 0 }} 페이지
        </p>
      </div>
      <!-- 태그 -->
      <div class="flex flex-wrap gap-1">
        <Badge
          v-for="tag in book.tags"
          :key="tag.name"
          :class="getTagDisplayInfo(tag).className"
          @click.stop="emit('selectTag', tag.name)"
        >
          {{ getTagDisplayInfo(tag).displayText }}
        </Badge>
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <Button size="sm" variant="outline" @click.stop="toggleFavorite">
        <Icon
          :icon="
            book.is_favorite
              ? 'solar:heart-broken-bold-duotone'
              : 'solar:heart-bold-duotone'
          "
          class="w-4 h-4"
        />
        {{ book.is_favorite ? "즐겨찾기 해제" : "즐겨찾기" }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        @click.stop="emit('show-details', book)"
      >
        <Icon icon="solar:info-circle-bold-duotone" class="w-4 h-4" />
        상세 정보
      </Button>
      <Button size="sm" variant="outline" @click.stop="openInNewWindow">
        <Icon icon="solar:square-top-down-bold-duotone" class="w-4 h-4" />
        새 창으로 열기
      </Button>
      <Button size="sm" variant="outline" @click.stop="openBookFolder">
        <Icon icon="solar:folder-open-bold-duotone" class="w-4 h-4" />
        폴더 열기
      </Button>
      <Button size="sm" variant="destructive" @click.stop="handleDeleteBook">
        <Icon
          icon="solar:trash-bin-minimalistic-bold-duotone"
          class="w-4 h-4"
        />
        삭제
      </Button>
    </div>
  </div>

  <!-- 삭제 확인 다이얼로그 -->
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
