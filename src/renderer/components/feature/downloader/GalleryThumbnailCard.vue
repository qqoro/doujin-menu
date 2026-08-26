<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Button } from "@/components/ui/button";
import { useGalleryCard } from "@/composables/useGalleryCard";
import type { CreditPrefix, MetaField } from "@/lib/cardLayout";
import { buildMetaLine } from "@/lib/galleryCard";
import { Icon } from "@iconify/vue";
import type { Gallery } from "node-hitomi";
import { computed } from "vue";
import CreditsLine from "../parts/CreditsLine.vue";
import MetaLine from "../parts/MetaLine.vue";
import GalleryStatusBadge from "./parts/GalleryStatusBadge.vue";

interface Props {
  gallery: Gallery & { thumbnailUrl: string };
  downloadStatus?: { status: string; progress?: number; error?: string };
  selected?: boolean;
  /** 라이브러리 보유 여부. 상위에서 한 번에 조회해 내려준다 */
  bookId?: number | null;
  /** 다운로드 경로. 상위에서 한 번만 읽어 내려준다 */
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
  // 삭제 다이얼로그는 페이지가 들고 있다 (useGalleryDelete 참고)
  "request-delete": [gallery: Gallery];
}>();

// 템플릿에 배열 리터럴을 직접 쓰면 vue-tsc가 `string[]`로 추론해 걸린다
const META_FIELDS: MetaField[] = ["pages", "language", "date"];

/** 그리드는 세 줄만 쓰므로 작가만 그린다 */
const CREDIT_FIELDS: CreditPrefix[] = ["artist"];

const metaParts = computed(() => buildMetaLine(props.gallery, META_FIELDS));

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
  <div
    class="group relative cursor-pointer overflow-hidden rounded-lg border"
    :class="{ 'ring-2 ring-blue-500': selected }"
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
    </div>

    <!-- 상태 배지. 호버 액션 오버레이(z-20)보다 위에 둡니다 -->
    <div class="absolute top-2 left-2 z-40 flex">
      <GalleryStatusBadge :status="cardStatus" />
    </div>

    <!-- 호버 시 배경 dim (투명 -> 불투명) -->
    <div
      class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/50"
    ></div>

    <!--
      하단 정보. z-30 아래로 내리면 안 된다 — 호버 버튼 영역이 `absolute inset-0
      z-20`으로 카드 전면을 덮는데 `opacity-0`은 히트테스트에 영향이 없어, 이
      영역이 더 낮으면 작가 클릭 복사가 영영 안 걸린다.

      영역 자체는 pointer-events-none이라 제목·메타를 누르면 클릭이 통과한다.
      작가 링크에만 pointer-events-auto를 준다.
    -->
    <div
      class="pointer-events-none absolute right-0 bottom-0 left-0 z-30 bg-gradient-to-t from-black/80 via-black/60 to-transparent px-2.5 pt-7 pb-2.5 text-white"
    >
      <!-- 그림자로 스크림이 얇아지는 자리를 보강한다. 스크림을 진하게 하면
           표지를 덜 보여주게 되므로 글씨만 띄운다 -->
      <p
        class="line-clamp-2 text-[13px] leading-snug font-bold break-all [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]"
      >
        {{ props.gallery.title.display }}
      </p>
      <CreditsLine
        class="pointer-events-auto mt-0.5 text-[11.5px] opacity-95"
        :credits="props.gallery"
        :fields="CREDIT_FIELDS"
        @select="copyToClipboard(`${$event.prefix}:${$event.name}`)"
      />
      <MetaLine class="mt-1 opacity-80" :parts="metaParts" />
    </div>

    <!-- 진행률 바. 하단 정보(z-30) 위에 얹혀야 그라디언트에 안 묻힙니다 -->
    <div
      v-if="cardStatus.kind === 'downloading'"
      class="absolute right-0 bottom-0 left-0 z-40 h-[3px] bg-white/25"
    >
      <div
        class="bg-primary h-full transition-[width] duration-300"
        :class="cardStatus.indeterminate ? 'w-full animate-pulse' : ''"
        :style="
          cardStatus.indeterminate
            ? undefined
            : { width: `${cardStatus.percent ?? 0}%` }
        "
      ></div>
    </div>

    <!--
      버튼 영역 (호버 시 표시). 문구는 그 상태의 주된 행동에만 단다.

      카드 최소 폭이 200px인데 `Button`은 `shrink-0 whitespace-nowrap`이라 줄지
      않는다. 버튼 넷에 전부 문구를 달면 약 261px이라 카드 밖으로 나가고 루트의
      `overflow-hidden`이 잘라 먹는다. `flex-wrap`은 그래도 안 맞을 때의 안전망.
    -->
    <div
      class="absolute inset-0 z-20 flex cursor-zoom-in flex-wrap items-center justify-center gap-2 px-2 opacity-0 transition-opacity group-hover:opacity-100"
      @click="emit('preview-gallery', gallery)"
    >
      <Button
        size="icon-sm"
        variant="secondary"
        title="미리보기"
        @click.stop="emit('preview-gallery', gallery)"
      >
        <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
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
        size="icon-sm"
        variant="destructive"
        title="삭제"
        @click.stop="handleDeleteGallery"
      >
        <Icon
          icon="solar:trash-bin-minimalistic-bold-duotone"
          class="h-4 w-4"
        />
      </Button>
    </div>
  </div>
</template>
