<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Button } from "@/components/ui/button";
import { useGalleryCard } from "@/composable/useGalleryCard";
import type { MetaField } from "@/lib/galleryCard";
import { Icon } from "@iconify/vue";
import type { Gallery } from "node-hitomi";
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

/**
 * 템플릿에 배열 리터럴을 직접 쓰면 vue-tsc가 `string[]`로 추론해
 * `MetaField[]` prop에 대입할 수 없다고 걸립니다. 상수로 빼서 타입을 박습니다.
 */
const META_FIELDS: MetaField[] = ["pages", "language", "date"];

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
      하단 정보. 3단(제목/작가/메타)으로 줄여 표지가 60% 이상 남습니다.

      **z-30 아래로 내리면 안 됩니다.** 호버 버튼 영역이 `absolute inset-0
      z-20`이라 카드 전면을 덮는데, `opacity-0`은 히트테스트에 영향이 없어서
      호버 중이 아닐 때도 클릭을 가로챕니다. 이 영역이 그보다 낮으면 작가
      클릭 복사가 영영 안 걸리고 미리보기만 열립니다.

      영역 자체는 pointer-events-none이라 제목·메타를 누르면 클릭이 호버
      버튼 영역으로 통과합니다. 작가 링크에만 pointer-events-auto를 줍니다.
    -->
    <div
      class="pointer-events-none absolute right-0 bottom-0 left-0 z-30 bg-gradient-to-t from-black/80 via-black/60 to-transparent px-2.5 pt-7 pb-2.5 text-white"
    >
      <!--
        그림자는 스크림이 얇아지는 자리를 보강합니다. 제목은 오버레이 위쪽
        20px 지점에 앉는데 그 높이의 그라디언트 알파가 약 0.33이라, 밝은 표지
        위에서는 흰 글씨 대비가 2.3:1까지 떨어집니다. 스크림 자체를 진하게
        하면 표지를 덜 보여주게 되므로 글씨만 띄웁니다.
      -->
      <p
        class="line-clamp-2 text-[13px] leading-snug font-bold break-all [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]"
      >
        {{ props.gallery.title.display }}
      </p>
      <GalleryCredits
        compact
        class="pointer-events-auto mt-0.5 text-[11.5px] opacity-95"
        :gallery="props.gallery"
        @copy="copyToClipboard"
      />
      <GalleryMetaLine
        class="mt-1 opacity-80"
        :gallery="props.gallery"
        :fields="META_FIELDS"
      />
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
      버튼 영역 (호버 시 표시).

      **문구는 그 상태의 주된 행동에만 답니다.** 카드 최소 폭이 200px인데
      (`Downloader.vue`의 `MIN_CARD_WIDTH`) `Button`은 기본 클래스에
      `shrink-0 whitespace-nowrap`이 있어 절대 줄지 않습니다. 버튼 넷에 전부
      한글 문구를 달면 약 261px이라 카드 밖으로 나가고, 루트의
      `overflow-hidden`이 양끝을 잘라 먹습니다.

      그래서 상태마다 문구를 하나만 둡니다. 받기 전에는 다운로드가, 보유중일
      때는 열기가 주된 행동입니다. 보유중 다운로드 버튼("완료")은 아예
      감춥니다 — 눌리지도 않는 데다 좌상단 배지가 이미 같은 말을 합니다.

      `flex-wrap`은 그래도 안 맞는 경우의 안전망입니다. 창이 아주 좁으면
      1열이 되면서 카드 폭이 200px 아래로 내려갈 수 있습니다.
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
