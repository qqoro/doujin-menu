<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import TagBadge from "@/components/common/TagBadge.vue";
import { Button } from "@/components/ui/button";
import { useGalleryCard } from "@/composables/useGalleryCard";
import type { MetaField } from "@/lib/cardLayout";
import { listCardScaleStyle, listThumbnailSize } from "@/lib/cardLayout";
import { buildMetaLine } from "@/lib/galleryCard";
import { tagSearchTerm } from "@/lib/tagBadge";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import type { GalleryDto } from "@/../types/ipc";
import { computed } from "vue";
import CreditsLine from "../parts/CreditsLine.vue";
import MetaLine from "../parts/MetaLine.vue";
import GalleryStatusBadge from "./parts/GalleryStatusBadge.vue";

interface Props {
  gallery: GalleryDto;
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
  "select-gallery": [gallery: GalleryDto];
  "preview-gallery": [gallery: GalleryDto];
  // 삭제 다이얼로그는 페이지가 들고 있습니다 (useGalleryDelete 참고)
  "request-delete": [gallery: GalleryDto];
}>();

const uiStore = useUiStore();

/**
 * 템플릿에 배열 리터럴을 직접 쓰면 vue-tsc가 `string[]`로 추론해
 * `MetaField[]` prop에 대입할 수 없다고 걸립니다. 상수로 빼서 타입을 박습니다.
 */
const META_FIELDS: MetaField[] = ["pages", "type", "language", "date", "id"];

const metaParts = computed(() => buildMetaLine(props.gallery, META_FIELDS));

/**
 * 썸네일 px 치수.
 *
 * 리스트는 CSS `zoom`을 쓸 수 없어(동적 측정이 깨집니다) 같은 줌 값을 받아
 * px을 직접 곱합니다. 자세한 이유는 `listThumbnailSize` 주석 참고.
 */
const thumbSize = computed(() => listThumbnailSize(uiStore.thumbnailZoom));

/** 카드 안쪽 글자·여백도 같은 배율로 키웁니다. `listCardScaleStyle` 주석 참고 */
const scaleStyle = computed(() => listCardScaleStyle(uiStore.thumbnailZoom));

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
</script>

<template>
  <!--
    `[&_[data-size=sm]]:text-[0.8em]`은 카드 안의 `Button size="sm"`을 위한 것입니다.
    그 변형만 글자 크기를 `text-[0.8rem]`으로 박아 둬서 `--text-*` 재정의가
    안 먹습니다. 후손 선택자라 특이도가 이겨 버튼 쪽 유틸을 덮습니다.
  -->
  <!--
    좁은 카드(@container/row)는 썸네일 옆에 제목·정보만 두고, 태그와 버튼은
    썸네일 아래까지 카드 폭 전체를 쓴다.
  -->
  <div
    class="hover:bg-muted/50 @container/row relative cursor-pointer overflow-hidden rounded-lg border p-3 transition-colors [&_[data-size=sm]]:text-[0.8em]"
    :class="{ 'ring-2 ring-blue-500': selected }"
    :style="scaleStyle"
    @click="emit('select-gallery', gallery)"
  >
    <div
      class="flex gap-3.5 @max-md/row:grid @max-md/row:grid-cols-[30%_1fr] @max-md/row:gap-3"
    >
      <div
        class="relative shrink-0 cursor-zoom-in self-start overflow-hidden rounded-md @max-md/row:max-w-full"
        :style="{
          width: `${thumbSize.width}px`,
          aspectRatio: `${thumbSize.width} / ${thumbSize.height}`,
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

      <div
        class="flex min-w-0 flex-1 flex-col gap-1.5 wrap-anywhere @max-md/row:contents"
      >
        <div class="flex min-w-0 flex-col gap-1.5">
          <h3 class="text-[0.9375em] leading-snug font-bold">
            {{ props.gallery.title.display }}
          </h3>

          <MetaLine
            class="text-muted-foreground @max-md/row:flex-wrap"
            interactive
            :parts="metaParts"
            @select="copyToClipboard(`id:${props.gallery.id}`)"
            @context="
              copyToClipboard(
                `https://hitomi.la/galleries/${props.gallery.id}.html`,
              )
            "
          />

          <CreditsLine
            class="text-muted-foreground text-[0.78125em]"
            :credits="props.gallery"
            @select="copyToClipboard(`${$event.prefix}:${$event.name}`)"
          />
        </div>

        <!-- 태그는 전부 보여줍니다. 성별 태그만 색으로 구분합니다 -->
        <div class="flex flex-wrap gap-1 @max-md/row:col-span-2">
          <TagBadge
            v-for="tag in props.gallery.tags"
            :key="`${tag.type}:${tag.name}`"
            :tag="tag"
            @click.stop="copyToClipboard(tagSearchTerm(tag))"
            @contextmenu.prevent.stop="
              copyToClipboard(`-${tagSearchTerm(tag)}`)
            "
          />
        </div>
      </div>

      <!--
      버튼 열. 리스트는 카드 폭이 넉넉하므로 문구를 답니다. 아이콘만 두면
      무슨 버튼인지 매번 호버해서 확인해야 합니다. 폭이 고정되도록
      `w-[5.75em]`을 줘서 보유중 여부에 따라 본문 폭이 흔들리지 않게 합니다.

      보유중이면 다운로드 버튼("완료")을 감춥니다. 눌리지도 않는 버튼이고
      썸네일 배지가 이미 같은 말을 하므로, 그 자리를 열기가 대신합니다.
    -->
      <div
        class="flex w-[5.75em] shrink-0 flex-col gap-1.5 @max-md/row:col-span-2 @max-md/row:w-auto @max-md/row:flex-row @max-md/row:justify-end"
      >
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
  </div>
</template>
