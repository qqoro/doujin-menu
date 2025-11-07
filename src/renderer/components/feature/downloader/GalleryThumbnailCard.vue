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
  buttonText,
  isDownloading,
  isDownloadCompleted,
  isDownloadFailed,
  handleOpenBook,
  handleDownload,
  handleDeleteGallery,
  confirmDeleteGallery,
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
    <div class="relative aspect-[3/4] h-auto w-full overflow-hidden">
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
    <div
      class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 to-transparent p-2"
    >
      <p
        class="truncate text-sm font-bold text-white group-hover:whitespace-normal"
      >
        {{ props.gallery.title.display }}
      </p>
    </div>
    <div
      class="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
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
        {{ buttonText }}
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
