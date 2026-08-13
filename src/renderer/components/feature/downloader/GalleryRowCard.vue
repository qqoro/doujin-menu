<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGalleryCard } from "@/composable/useGalleryCard";
import type { MetaField } from "@/lib/galleryCard";
import { listThumbnailSize } from "@/lib/galleryCard";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import type { Gallery } from "node-hitomi";
import { computed } from "vue";
import GalleryCredits from "./parts/GalleryCredits.vue";
import GalleryMetaLine from "./parts/GalleryMetaLine.vue";
import GalleryStatusBadge from "./parts/GalleryStatusBadge.vue";

interface Props {
  gallery: Gallery & { thumbnailUrl: string };
  downloadStatus?: { status: string; progress?: number; error?: string };
  selected?: boolean;
  /** 라이브러리 보유 여부. 상위에서 한 번에 조회해 내려줍니다. */
  bookId?: number | null;
  /** 다운로드 경로. 상위에서 한 번만 읽어 내려줍니다. */
  downloadPath?: string;
}

const props = withDefaults(defineProps<Props>(), {
  downloadStatus: () => ({ status: "idle" }),
  selected: false,
  bookId: null,
  downloadPath: "",
});

const emit = defineEmits<{
  "select-gallery": [gallery: Gallery];
  "preview-gallery": [gallery: Gallery];
  // 삭제 다이얼로그는 페이지가 들고 있습니다 (useGalleryDelete 참고)
  "request-delete": [gallery: Gallery];
}>();

const uiStore = useUiStore();

/**
 * 템플릿에 배열 리터럴을 직접 쓰면 vue-tsc가 `string[]`로 추론해
 * `MetaField[]` prop에 대입할 수 없다고 걸립니다. 상수로 빼서 타입을 박습니다.
 */
const META_FIELDS: MetaField[] = ["pages", "type", "language", "date", "id"];

/**
 * 썸네일 px 치수.
 *
 * 리스트는 CSS `zoom`을 쓸 수 없어(동적 측정이 깨집니다) 같은 줌 값을 받아
 * px을 직접 곱합니다. 자세한 이유는 `listThumbnailSize` 주석 참고.
 */
const thumbSize = computed(() => listThumbnailSize(uiStore.thumbnailZoom));

// composable 사용
const {
  cardStatus,
  isDownloading,
  isDownloadCompleted,
  handleOpenBook,
  handleDownload,
  handleDeleteGallery,
  copyToClipboard,
} = useGalleryCard(props, emit);

/** 태그 배지 색. 성별 태그만 구분해 스캔을 돕습니다 */
const tagTone = (type: string) => {
  if (type === "female")
    return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200";
  if (type === "male")
    return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200";
  return "";
};

/** 태그를 클릭 복사용 검색어로 바꿉니다 */
const tagTerm = (type: string, name: string) =>
  `${type === "male" || type === "female" ? type : "tag"}:${name}`;
</script>

<template>
  <div
    class="hover:bg-muted/50 relative flex cursor-pointer gap-3.5 overflow-hidden rounded-lg border p-3 transition-colors"
    :class="{ 'ring-2 ring-blue-500': selected }"
    @click="emit('select-gallery', gallery)"
  >
    <div
      class="relative shrink-0 cursor-zoom-in overflow-hidden rounded-md"
      :style="{
        width: `${thumbSize.width}px`,
        height: `${thumbSize.height}px`,
      }"
      @click.stop="emit('preview-gallery', gallery)"
    >
      <ProxiedImage
        :id="props.gallery.id"
        :url="props.gallery.thumbnailUrl"
        :referer="`https://hitomi.la/reader/${props.gallery.id}.html`"
        alt="Thumbnail"
        class="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
      />
      <div class="absolute top-1.5 left-1.5 flex">
        <GalleryStatusBadge :status="cardStatus" />
      </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <h3 class="text-[15px] leading-snug font-bold">
        {{ props.gallery.title.display }}
      </h3>

      <GalleryMetaLine
        class="text-muted-foreground"
        interactive
        :gallery="props.gallery"
        :fields="META_FIELDS"
        @copy-id="copyToClipboard(`id:${$event}`)"
        @copy-url="
          copyToClipboard(`https://hitomi.la/galleries/${$event}.html`)
        "
      />

      <GalleryCredits
        class="text-muted-foreground text-[12.5px]"
        :gallery="props.gallery"
        @copy="copyToClipboard"
      />

      <!-- 태그는 전부 보여줍니다. 성별 태그만 색으로 구분합니다 -->
      <div class="flex flex-wrap gap-1">
        <Badge
          v-for="tag in props.gallery.tags"
          :key="`${tag.type}:${tag.name}`"
          variant="secondary"
          class="cursor-pointer hover:underline"
          :class="tagTone(tag.type)"
          @click.stop="copyToClipboard(tagTerm(tag.type, tag.name))"
          @contextmenu.prevent.stop="
            copyToClipboard(`-${tagTerm(tag.type, tag.name)}`)
          "
        >
          {{ tag.name }}
        </Badge>
      </div>
    </div>

    <!--
      버튼 열. 리스트는 카드 폭이 넉넉하므로 문구를 답니다. 아이콘만 두면
      무슨 버튼인지 매번 호버해서 확인해야 합니다. 폭이 고정되도록
      `w-[92px]`을 줘서 보유중 여부에 따라 본문 폭이 흔들리지 않게 합니다.

      보유중이면 다운로드 버튼("완료")을 감춥니다. 눌리지도 않는 버튼이고
      썸네일 배지가 이미 같은 말을 하므로, 그 자리를 열기가 대신합니다.
    -->
    <div class="flex w-[92px] shrink-0 flex-col gap-1.5">
      <Button
        size="sm"
        variant="outline"
        @click.stop="emit('preview-gallery', gallery)"
      >
        <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
        미리보기
      </Button>
      <Button
        v-if="!isDownloadCompleted"
        size="sm"
        :disabled="isDownloading"
        @click.stop="handleDownload"
      >
        <Icon icon="solar:download-bold-duotone" class="h-4 w-4" />
        {{ cardStatus.buttonLabel }}
      </Button>
      <Button v-else size="sm" @click.stop="handleOpenBook">
        <Icon icon="solar:book-bold-duotone" class="h-4 w-4" />
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
          class="h-4 w-4"
        />
        삭제
      </Button>
    </div>
  </div>
</template>
