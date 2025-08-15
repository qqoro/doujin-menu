<script setup lang="ts">
import { ipcRenderer } from "@/api";
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Badge } from "@/components/ui/badge";
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

const emit = defineEmits(["select-gallery"]);
const isBookExists = ref(false);

onMounted(async () => {
  if (props.gallery.id) {
    const result = await ipcRenderer.invoke(
      "check-book-exists-by-hitomi-id",
      props.gallery.id,
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
        v-if="isBookExists"
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
      <!-- 작가/시리즈/캐릭터/페이지 -->
      <div class="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <p>
          <Icon
            icon="solar:pen-new-round-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          작가: {{ props.gallery.artists?.join(", ") || "알 수 없음" }}
        </p>
        <!-- Add Series here -->
        <p v-if="props.gallery.series && props.gallery.series.length > 0">
          <Icon
            icon="solar:bookmark-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          시리즈: {{ props.gallery.series.join(", ") }}
        </p>
        <!-- Add Characters here -->
        <p
          v-if="props.gallery.characters && props.gallery.characters.length > 0"
        >
          <Icon
            icon="solar:user-linear"
            class="w-4 h-4 inline-block align-text-bottom"
          />
          캐릭터: {{ props.gallery.characters.join(", ") }}
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
          >{{ tag.name }}</Badge
        >
      </div>
    </div>
    <Button
      size="sm"
      :disabled="isDownloading || isDownloadCompleted"
      @click.stop="handleDownload"
    >
      {{ buttonText }}
    </Button>
  </div>
</template>
