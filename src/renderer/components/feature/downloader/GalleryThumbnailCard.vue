<script setup lang="ts">
import { ipcRenderer } from "@/api";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { computed, onMounted, ref, toRaw } from "vue";
import { useRouter } from "vue-router";
import * as api from "@/api";
import { toast } from "vue-sonner";
import { useDownloadQueueStore } from "@/store/downloadQueueStore";
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

const isDeleteDialogOpen = ref(false);

const handleDeleteGallery = () => {
  isDeleteDialogOpen.value = true;
};

const confirmDeleteGallery = async () => {
  if (!bookId.value) {
    toast.error("삭제할 책 정보를 찾을 수 없습니다.");
    isDeleteDialogOpen.value = false;
    return;
  }

  try {
    await api.deleteBook(bookId.value);
    toast.success("책 삭제 완료", {
      description: `${props.gallery.title.display}이(가) 삭제되었습니다.`, 
    });
    bookId.value = null; // 책 삭제 후 bookId 초기화
  } catch (error) {
    console.error("책 삭제 실패:", error);
    toast.error("책 삭제 실패", {
      description: "책을 삭제하는 중 오류가 발생했습니다.",
    });
  } finally {
    isDeleteDialogOpen.value = false;
  }
};

const props = defineProps({
  gallery: {
    type: Object,
    required: true,
  },
  downloadStatus: {
    type: Object,
    default: () => ({ status: "idle" }),
  },
  downloadPath: {
    type: String,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["select-gallery", "preview-gallery"]);
const bookId = ref<number | null>(null);
const router = useRouter();
const downloadQueueStore = useDownloadQueueStore();

const viewerLink = computed(() => ({
  name: "Viewer",
  params: { id: bookId.value },
  query: {
    filter: JSON.stringify(toRaw({ hitomi_id: props.gallery.id })),
  },
}));

const openBookInNewWindow = () => {
  const url = `/viewer/${viewerLink.value.params.id}?${new URLSearchParams(viewerLink.value.query).toString()}`;
  api.openNewWindow(url);
};

const handleOpenBook = (event: MouseEvent) => {
  if (!bookId.value) return;
  if (event.ctrlKey || event.metaKey) {
    openBookInNewWindow();
  } else {
    router.push(viewerLink.value);
  }
};

onMounted(async () => {
  if (props.gallery.id) {
    const result = await ipcRenderer.invoke(
      "check-book-exists-by-hitomi-id",
      props.gallery.id,
    );
    console.log(
      "check-book-exists-by-hitomi-id >>>>>>>>",
      result,
      props.gallery.id,
      props.gallery,
    );
    if (result.success && result.exists) {
      bookId.value = result.bookId ?? null;
    }
  }
});

const handleDownload = async () => {
  if (!props.downloadPath) {
    toast.error("다운로드 폴더를 먼저 지정해주세요.");
    return;
  }

  try {
    await downloadQueueStore.addToQueue({
      galleryId: props.gallery.id,
      galleryTitle: props.gallery.title.display,
      galleryArtist: props.gallery.artists?.[0],
      thumbnailUrl: props.gallery.thumbnailUrl,
      downloadPath: props.downloadPath,
    });
    toast.success("다운로드 큐에 추가되었습니다.", {
      description: props.gallery.title.display,
    });
  } catch (error) {
    toast.error("큐 추가 실패", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};

const buttonText = computed(() => {
  if (bookId.value) {
    return "완료";
  }
  switch (props.downloadStatus.status) {
    case "starting":
      return "시작 중...";
    case "pending":
      return "대기 중";
    case "paused":
      return "일시정지";
    case "progress":
      return `${props.downloadStatus.progress || 0}%`;
    case "completed":
      return "완료";
    case "failed":
      return "실패";
    default:
      return "다운로드";
  }
});

const isDownloading = computed(() => {
  return (
    !bookId.value && // 책이 이미 존재하면 다운로드 중이 아님
    (props.downloadStatus.status === "starting" ||
      props.downloadStatus.status === "progress" ||
      props.downloadStatus.status === "pending" ||
      props.downloadStatus.status === "paused")
  );
});

const isDownloadCompleted = computed(() => {
  return bookId.value || props.downloadStatus.status === "completed";
});

const isDownloadFailed = computed(() => {
  return props.downloadStatus.status === "failed";
});
</script>

<template>
  <div
    class="relative group border rounded-lg overflow-hidden cursor-pointer"
    :class="{
      'opacity-50': isDownloading,
      'bg-green-50/50': isDownloadCompleted,
      'bg-red-50/50': isDownloadFailed,
      'ring-2 ring-blue-500': selected, // 선택 시 파란색 테두리 추가
    }"
    @click="emit('select-gallery', gallery)"
  >
    <div class="w-full h-auto aspect-[3/4] overflow-hidden relative">
      <ProxiedImage
        :id="props.gallery.id"
        :url="props.gallery.thumbnailUrl"
        :referer="`https://hitomi.la/reader/${props.gallery.id}.html`"
        alt="Thumbnail"
        class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
      />
      <div
        v-if="bookId"
        class="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1"
      >
        <Icon icon="solar:check-circle-bold" class="w-5 h-5" />
      </div>
    </div>
    <div
      class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent"
    >
      <p
        class="text-white text-sm font-bold truncate group-hover:whitespace-normal"
      >
        {{ props.gallery.title.display }}
      </p>
    </div>
    <div
      class="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <Button
        size="icon"
        variant="secondary"
        @click.stop="emit('preview-gallery', gallery)"
      >
        <Icon icon="solar:eye-bold-duotone" class="w-5 h-5" />
      </Button>
      <Button
        size="sm"
        :disabled="isDownloading || isDownloadCompleted"
        @click.stop="handleDownload"
      >
        {{ buttonText }}
      </Button>
      <Button
        v-if="isDownloadCompleted"
        size="sm"
        @click.stop="handleOpenBook"
      >
        <Icon icon="solar:book-bold-duotone" class="w-5 h-5" />
        열기
      </Button>
      <Button
        v-if="isDownloadCompleted"
        size="sm"
        variant="destructive"
        @click.stop="handleDeleteGallery"
      >
        <Icon icon="solar:trash-bin-minimalistic-bold-duotone" class="w-5 h-5" />
        삭제
      </Button>
    </div>
  </div>

  <!-- 삭제 확인 다이얼로그 -->
  <AlertDialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
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
        <AlertDialogAction @click="confirmDeleteGallery">삭제</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
