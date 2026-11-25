<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import type { CardStatus } from "@/lib/galleryCard";
import type { GalleryDto } from "@/../types/ipc";
import {
  HoverCardContent,
  HoverCardPortal,
  HoverCardRoot,
  HoverCardTrigger,
} from "reka-ui";
import { computed } from "vue";
import { toast } from "vue-sonner";
import CreditsLine from "../../parts/CreditsLine.vue";
import GalleryStatusBadge from "./GalleryStatusBadge.vue";

/**
 * 상세보기 옆 목록의 한 줄. RowCardShell 위에 만들지 않는다 — 셸의 썸네일 크기는
 * 확대 설정에 묶여 있고 테두리·여백·좁은 폭 배치까지 고정이라, 300px 칸에 다섯 줄을
 * 쌓는 이 목록에서는 전부 꺼야 한다.
 */
const props = defineProps<{
  gallery: GalleryDto;
  status: CardStatus;
}>();

const emit = defineEmits<{ select: [gallery: GalleryDto] }>();

const copyTerm = async (term: string) => {
  const text = term.replaceAll(" ", "_");
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${text}가 클립보드에 복사되었습니다.`, { duration: 750 });
  } catch {
    toast.error("복사 실패");
  }
};

const referer = computed(
  () => `https://hitomi.la/reader/${props.gallery.id}.html`,
);

const languageText = computed(
  () =>
    props.gallery.languageName?.local || props.gallery.languageName?.english,
);
</script>

<template>
  <HoverCardRoot :open-delay="150" :close-delay="0">
    <HoverCardTrigger as-child>
      <li
        class="hover:bg-muted flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors"
        @click="emit('select', gallery)"
      >
        <div class="aspect-3/4 w-12 shrink-0 overflow-hidden rounded">
          <ProxiedImage
            :id="gallery.id"
            :url="gallery.thumbnailUrl"
            :referer="referer"
            alt="표지"
            class="h-full w-full object-cover"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="line-clamp-2 text-sm leading-snug">
            {{ gallery.title.display }}
          </p>
          <div
            class="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs"
          >
            <CreditsLine
              class="min-w-0 truncate"
              :credits="gallery"
              :fields="['artist']"
              @select="copyTerm(`${$event.prefix}:${$event.name}`)"
            />
            <span v-if="languageText" class="shrink-0">{{ languageText }}</span>
            <span class="flex shrink-0">
              <GalleryStatusBadge :status="status" />
            </span>
          </div>
        </div>
      </li>
    </HoverCardTrigger>

    <!-- 목록이 다이얼로그 오른쪽 끝에 붙어 있어 왼쪽(정보 영역 위)에 띄운다 -->
    <HoverCardPortal>
      <HoverCardContent
        side="left"
        :side-offset="12"
        :collision-padding="8"
        class="bg-popover text-popover-foreground pointer-events-none z-50 w-[min(20rem,45vh)] rounded-lg border p-2 shadow-lg"
      >
        <div class="aspect-3/4 w-full overflow-hidden rounded-md">
          <ProxiedImage
            :id="gallery.id"
            :url="gallery.thumbnailUrl"
            :referer="referer"
            alt="표지"
            class="h-full w-full object-cover"
          />
        </div>
        <p
          class="text-muted-foreground mt-1.5 line-clamp-2 text-xs leading-snug"
        >
          {{ gallery.title.display }}
        </p>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
