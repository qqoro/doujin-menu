<script setup lang="ts">
import * as api from "@/api";
import { ipcRenderer } from "@/api";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { computed, onMounted, ref, toRaw } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
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

const copyToClipboard = async (text: string) => {
  const formattedText = text.replaceAll(" ", "_"); // Replace spaces with underscores
  await navigator.clipboard.writeText(formattedText);
  toast.success(`${formattedText}가 클립보드에 복사되었습니다.`, {
    duration: 750,
  });
};

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
    if (result.success && result.exists) {
      bookId.value = result.bookId ?? null;
    }
  }
});

const handleDownload = () => {
  if (!props.downloadPath) {
    alert("다운로드 폴더를 먼저 지정해주세요."); // TODO: 토스트 알림으로 변경
    return;
  }
  ipcRenderer.invoke("download-gallery", {
    galleryId: props.gallery.id,
    downloadPath: props.downloadPath,
  });
  console.log("다운로드 요청:", props.gallery.id);
};

const buttonText = computed(() => {
  if (bookId.value) {
    return "다운로드 완료";
  }
  switch (props.downloadStatus.status) {
    case "starting":
      return "다운로드 시작...";
    case "progress":
      return `다운로드 중 (${props.downloadStatus.progress || 0}%)`;
    case "completed":
      return "다운로드 완료";
    case "failed":
      return "다운로드 실패";
    default:
      return "다운로드";
  }
});

const isDownloading = computed(() => {
  return (
    !bookId.value && // 책이 이미 존재하면 다운로드 중이 아님
    (props.downloadStatus.status === "starting" ||
      props.downloadStatus.status === "progress")
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
    class="flex items-center p-2 border-b hover:bg-muted/50 transition-colors cursor-pointer"
    :class="{
      'opacity-50': isDownloading,
      'bg-green-50/50': isDownloadCompleted,
      'bg-red-50/50': isDownloadFailed,
      'ring-2 ring-blue-500': selected, // 선택 시 파란색 테두리 추가
    }"
    @click="emit('select-gallery', gallery)"
  >
    <div class="w-48 h-64 mr-4 flex-shrink-0 overflow-hidden relative">
      <ProxiedImage
        :id="props.gallery.id"
        :url="props.gallery.thumbnailUrl"
        :referer="`https://hitomi.la/reader/${props.gallery.id}.html`"
        alt="Thumbnail"
        class="w-full h-full object-cover rounded-md transition-transform duration-300 hover:scale-110"
      />
      <div
        v-if="isDownloadCompleted"
        class="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1"
      >
        <Icon icon="solar:check-circle-bold" class="w-5 h-5" />
      </div>
    </div>
    <div class="flex-1 flex flex-col gap-2">
      <!-- 제목 -->
      <p class="text-xs text-muted-foreground">
        {{ props.gallery.type }} |
        {{
          props.gallery.languageName?.local ||
          props.gallery.languageName?.english
        }}
      </p>
      <h3 class="font-bold text-lg">{{ props.gallery.title.display }}</h3>
      <!-- 작가/그룹/시리즈/캐릭터/페이지 -->
      <div class="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <p>
          <Icon
            icon="solar:pen-new-round-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          작가:
          <template
            v-if="props.gallery.artists && props.gallery.artists.length > 0"
          >
            <template
              v-for="(artist, index) in props.gallery.artists"
              :key="artist"
            >
              <button
                class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
                @click.stop="copyToClipboard(`artist:${artist}`)"
              >
                {{ artist }}
              </button>
              <span v-if="index < props.gallery.artists.length - 1">, </span>
            </template>
          </template>
          <template v-else> 알 수 없음 </template>
        </p>
        <!-- 그룹 추가 -->
        <p v-if="props.gallery.groups && props.gallery.groups.length > 0">
          <Icon
            icon="solar:users-group-rounded-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          그룹:
          <template
            v-for="(group, index) in props.gallery.groups"
            :key="group"
          >
            <button
              class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
              @click.stop="copyToClipboard(`group:${group}`)"
            >
              {{ group }}
            </button>
            <span v-if="index < props.gallery.groups.length - 1">, </span>
          </template>
        </p>
        <!-- Add Series here -->
        <p v-if="props.gallery.series && props.gallery.series.length > 0">
          <Icon
            icon="solar:bookmark-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          시리즈:
          <template
            v-for="(series, index) in props.gallery.series"
            :key="series"
          >
            <button
              class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
              @click.stop="copyToClipboard(`series:${series}`)"
            >
              {{ series }}
            </button>
            <span v-if="index < props.gallery.series.length - 1">, </span>
          </template>
        </p>
        <!-- Add Characters here -->
        <p
          v-if="props.gallery.characters && props.gallery.characters.length > 0"
        >
          <Icon
            icon="solar:user-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          캐릭터:
          <template
            v-for="(character, index) in props.gallery.characters"
            :key="character"
          >
            <button
              class="inline-block text-left p-0 m-0 border-none bg-transparent cursor-pointer hover:underline text-current"
              @click.stop="copyToClipboard(`character:${character}`)"
            >
              {{ character }}
            </button>
            <span v-if="index < props.gallery.characters.length - 1">, </span>
          </template>
        </p>
        <p>
          <Icon
            icon="solar:document-text-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          {{ props.gallery.files?.length || 0 }} 페이지
        </p>
      </div>
      <!-- 태그 -->
      <div class="flex flex-wrap gap-1">
        <Badge
          v-for="tag in props.gallery.tags"
          :key="tag.name"
          variant="secondary"
          class="cursor-pointer hover:underline"
          @click.stop="
            copyToClipboard(
              `${tag.type === 'male' || tag.type === 'female' ? tag.type : 'tag'}:${tag.name}`,
            )
          "
          >{{ tag.name }}</Badge
        >
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <Button
        size="sm"
        variant="outline"
        @click.stop="emit('preview-gallery', gallery)"
      >
        <Icon icon="solar:eye-bold-duotone" class="w-4 h-4" />
        미리보기
      </Button>
      <Button
        size="sm"
        :disabled="isDownloading || isDownloadCompleted"
        @click.stop="handleDownload"
      >
        <Icon icon="solar:download-bold-duotone" class="w-4 h-4" />
        {{ buttonText }}
      </Button>
      <Button v-if="isDownloadCompleted" size="sm" @click.stop="handleOpenBook">
        <Icon icon="solar:book-bold-duotone" class="w-4 h-4" />
        열기
      </Button>
      <Button
        v-if="isDownloadCompleted"
        size="sm"
        variant="destructive"
        @click.stop="handleDeleteGallery"
      >
        <Icon icon="solar:trash-bin-minimalistic-bold-duotone" class="w-4 h-4" />
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
