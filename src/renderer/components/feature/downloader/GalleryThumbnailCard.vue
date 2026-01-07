<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
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
import { Button } from "@/components/ui/button";
import { useGalleryCard } from "@/composable/useGalleryCard";
import { Icon } from "@iconify/vue";
import type { Gallery } from "node-hitomi";

interface Props {
  gallery: Gallery & { thumbnailUrl: string };
  downloadStatus?: { status: string; progress?: number; error?: string };
  selected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  downloadStatus: () => ({ status: "idle" }),
  selected: false,
});

const emit = defineEmits<{
  "select-gallery": [gallery: Gallery];
  "preview-gallery": [gallery: Gallery];
  "book-deleted": [galleryId: number];
}>();

// composable 사용
const {
  isDeleteDialogOpen,
  isDownloading,
  isDownloadCompleted,
  isDownloadFailed,
  handleOpenBook,
  handleDownload,
  handleDeleteGallery,
  confirmDeleteGallery,
  copyToClipboard,
} = useGalleryCard(props, emit);
</script>

<template>
  <div
    class="group relative cursor-pointer overflow-hidden rounded-lg border"
    :class="{
      'opacity-50': isDownloading,
      'bg-green-50/50': isDownloadCompleted,
      'bg-red-50/50': isDownloadFailed,
      'ring-2 ring-blue-500': selected, // 선택 시 파란색 테두리 추가
    }"
    @click="emit('select-gallery', gallery)"
  >
    <div class="relative aspect-3/4 h-auto w-full overflow-hidden">
      <ProxiedImage
        :id="props.gallery.id"
        :url="props.gallery.thumbnailUrl"
        :referer="`https://hitomi.la/reader/${props.gallery.id}.html`"
        alt="Thumbnail"
        class="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110"
      />
      <div
        v-if="isDownloadCompleted"
        class="absolute top-2 right-2 rounded-full bg-green-500 p-1 text-white"
      >
        <Icon icon="solar:check-circle-bold" class="h-5 w-5" />
      </div>
    </div>
    <!-- 호버 시 배경 dim (투명 -> 불투명) -->
    <div
      class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/50"
    ></div>

    <!-- 하단 정보 영역 (항상 표시) -->
    <div
      class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-3"
    >
      <p class="mb-2 line-clamp-2 text-sm font-bold text-white">
        {{ props.gallery.title.display }}
      </p>
      <div class="space-y-1 text-xs text-white/90">
        <!-- 작가 -->
        <p class="truncate">
          <Icon
            icon="solar:pen-new-round-linear"
            class="mr-1 inline-block h-3 w-3"
          />
          <template
            v-if="props.gallery.artists && props.gallery.artists.length > 0"
          >
            <template
              v-for="(artist, index) in props.gallery.artists"
              :key="artist"
            >
              <button
                class="m-0 inline-block cursor-pointer border-none bg-transparent p-0 text-left text-current hover:underline"
                @click.stop="copyToClipboard(`artist:${artist}`)"
              >
                {{ artist }}
              </button>
              <span v-if="index < props.gallery.artists.length - 1">, </span>
            </template>
          </template>
          <template v-else> 알 수 없음 </template>
        </p>
        <!-- 그룹 -->
        <p
          v-if="props.gallery.groups && props.gallery.groups.length > 0"
          class="truncate"
        >
          <Icon
            icon="solar:users-group-rounded-linear"
            class="mr-1 inline-block h-3 w-3"
          />
          <template v-for="(group, index) in props.gallery.groups" :key="group">
            <button
              class="m-0 inline-block cursor-pointer border-none bg-transparent p-0 text-left text-current hover:underline"
              @click.stop="copyToClipboard(`group:${group}`)"
            >
              {{ group }}
            </button>
            <span v-if="index < props.gallery.groups.length - 1">, </span>
          </template>
        </p>
        <!-- 시리즈 -->
        <p
          v-if="props.gallery.series && props.gallery.series.length > 0"
          class="truncate"
        >
          <Icon
            icon="solar:bookmark-linear"
            class="mr-1 inline-block h-3 w-3"
          />
          <template
            v-for="(series, index) in props.gallery.series"
            :key="series"
          >
            <button
              class="m-0 inline-block cursor-pointer border-none bg-transparent p-0 text-left text-current hover:underline"
              @click.stop="copyToClipboard(`series:${series}`)"
            >
              {{ series }}
            </button>
            <span v-if="index < props.gallery.series.length - 1">, </span>
          </template>
        </p>
        <!-- 캐릭터 -->
        <p
          v-if="props.gallery.characters && props.gallery.characters.length > 0"
          class="truncate"
        >
          <Icon icon="solar:user-linear" class="mr-1 inline-block h-3 w-3" />
          <template
            v-for="(character, index) in props.gallery.characters"
            :key="character"
          >
            <button
              class="m-0 inline-block cursor-pointer border-none bg-transparent p-0 text-left text-current hover:underline"
              @click.stop="copyToClipboard(`character:${character}`)"
            >
              {{ character }}
            </button>
            <span v-if="index < props.gallery.characters.length - 1">, </span>
          </template>
        </p>
        <!-- 페이지 -->
        <p>
          <Icon
            icon="solar:document-text-linear"
            class="mr-1 inline-block h-3 w-3"
          />
          {{ props.gallery.files?.length || 0 }} 페이지
        </p>
      </div>
    </div>

    <!-- 버튼 영역 (호버 시 표시) -->
    <div
      class="absolute inset-0 flex cursor-zoom-in items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100"
      @click="emit('preview-gallery', gallery)"
    >
      <Button
        size="icon"
        variant="secondary"
        @click.stop="emit('preview-gallery', gallery)"
      >
        <Icon icon="solar:eye-bold-duotone" class="h-5 w-5" />
      </Button>
      <Button
        size="sm"
        :disabled="isDownloading || isDownloadCompleted"
        @click.stop="handleDownload"
      >
        <Icon icon="solar:download-bold-duotone" class="h-4 w-4" />
        {{
          isDownloading
            ? "다운로드 중..."
            : isDownloadCompleted
              ? "완료"
              : "다운로드"
        }}
      </Button>
      <Button v-if="isDownloadCompleted" size="sm" @click.stop="handleOpenBook">
        <Icon icon="solar:book-bold-duotone" class="h-5 w-5" />
        열기
      </Button>
      <Button
        v-if="isDownloadCompleted"
        size="sm"
        variant="destructive"
        @click.stop="handleDeleteGallery"
      >
        <Icon
          icon="solar:trash-bin-minimalistic-bold-duotone"
          class="h-5 w-5"
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
        <AlertDialogAction @click="confirmDeleteGallery"
          >삭제</AlertDialogAction
        >
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
