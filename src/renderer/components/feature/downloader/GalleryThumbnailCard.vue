<script setup lang="ts">
import { ipcRenderer } from "@/api";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { computed, onMounted, ref } from "vue";

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
const isBookExists = ref(false);

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
    if (result.success) {
      isBookExists.value = result.exists;
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
  switch (props.downloadStatus.status) {
    case "starting":
      return "시작 중...";
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
    props.downloadStatus.status === "starting" ||
    props.downloadStatus.status === "progress"
  );
});

const isDownloadCompleted = computed(() => {
  return props.downloadStatus.status === "completed";
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
        v-if="isBookExists"
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
    </div>
  </div>
</template>
