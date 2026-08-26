<script setup lang="ts">
import { LightBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useBookCard } from "@/composables/useBookCard";
import { useTagDisplay } from "@/composables/useTagDisplay";
import { buildBookMetaLine } from "@/lib/bookCard";
import type { CreditPrefix, MetaField } from "@/lib/cardLayout";
import { Icon } from "@iconify/vue";
import { computed, ref } from "vue";
import type { Book } from "../../../types/ipc";
import BookCardMenu from "./parts/BookCardMenu.vue";
import BookCardMenuButton from "./parts/BookCardMenuButton.vue";
import CoverCardShell from "./parts/CoverCardShell.vue";
import CreditsLine from "./parts/CreditsLine.vue";
import MetaLine from "./parts/MetaLine.vue";

const props = defineProps<{
  book: Book;
  queryKey: readonly unknown[];
  hideTags?: boolean;
  externalImageViewerPath?: string;
  externalArchiveViewerPath?: string;
}>();
const emit = defineEmits([
  "selectTag",
  "excludeTag",
  "selectArtist",
  "selectGroup",
  "toggle-favorite",
  "open-book-folder",
  "show-details",
  "show-preview",
  "request-delete",
]);

const { getTagDisplayInfo } = useTagDisplay();

/**
 * 템플릿에 배열 리터럴을 직접 쓰면 vue-tsc가 `string[]`로 추론해 `MetaField[]`
 * prop에 대입할 수 없다고 걸린다. 상수로 빼서 타입을 박는다.
 */
const META_FIELDS: MetaField[] = ["pages", "type", "language"];

/** 오버레이는 줄 수가 정해져 있어 작가·그룹까지만 그린다 */
const CREDIT_FIELDS: CreditPrefix[] = ["artist", "group"];

const {
  isOffline,
  openInNewWindow,
  handleCardClick,
  coverUrl,
  credits,
  toggleFavorite,
  menuItems,
} = useBookCard(props, emit);

const metaParts = computed(() => buildBookMetaLine(props.book, META_FIELDS));

// 태그 영역 펼침 상태. 펼치면 오버레이가 표지 위로 자라 카드 높이는 그대로다
const isTagsExpanded = ref(false);

const handleCreditSelect = (credit: { prefix: CreditPrefix; name: string }) => {
  emit(
    credit.prefix === "artist" ? "selectArtist" : "selectGroup",
    credit.name,
  );
};
</script>

<template>
  <ContextMenu>
    <!-- as-child로 카드 자체를 트리거로 쓴다. 셸(CoverCardShell)이 단일 루트
         컴포넌트라 트리거 프롭이 셸 루트로 전달된다. 래퍼가 하나 더 끼면 표지
         비율로 확정한 카드 높이가 래퍼 기준과 어긋난다 -->
    <ContextMenuTrigger as-child>
      <CoverCardShell
        :cover-url="coverUrl"
        :alt="book.title"
        :is-offline="isOffline"
        :is-favorite="!!book.is_favorite"
        @click="handleCardClick"
      >
        <template #overlay>
          <!-- 그림자는 스크림이 얇아지는 자리를 보강한다. 밝은 표지 위에서는
               흰 글씨 대비가 2.3:1까지 떨어지는 지점이다 -->
          <p
            class="line-clamp-2 text-[13px] leading-snug font-bold break-all [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]"
            :title="book.title"
          >
            {{ book.title }}
          </p>
          <CreditsLine
            class="pointer-events-auto mt-0.5 text-[11.5px] opacity-95"
            :credits="credits"
            :fields="CREDIT_FIELDS"
            @select="handleCreditSelect"
          />
          <MetaLine class="mt-1 opacity-80" :parts="metaParts" />

          <!-- 태그: 기본 한 줄, + 버튼으로 펼친다. 펼침은 위로 자란다 -->
          <div
            v-if="!hideTags && book.tags?.length"
            class="pointer-events-auto mt-1.5 flex items-start gap-1"
            :class="
              isTagsExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'
            "
          >
            <div
              class="flex min-w-0 flex-1 items-center gap-1"
              :class="
                isTagsExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'
              "
            >
              <!-- 표지 위 그라디언트에 얹히므로 scrim 톤(반투명)을 쓴다 -->
              <LightBadge
                v-for="tag in book.tags"
                :key="tag.name"
                :class="getTagDisplayInfo(tag, 'scrim').className"
                class="flex-shrink-0"
                @click.prevent.stop="emit('selectTag', tag.name)"
                @contextmenu.prevent.stop="emit('excludeTag', tag.name)"
              >
                {{ getTagDisplayInfo(tag, "scrim").displayText }}
              </LightBadge>
            </div>
            <button
              v-if="book.tags.length > 1"
              class="flex-shrink-0 text-white/70 transition-colors hover:text-white"
              @click.prevent.stop="isTagsExpanded = !isTagsExpanded"
            >
              <Icon
                :icon="
                  isTagsExpanded
                    ? 'solar:minus-circle-bold-duotone'
                    : 'solar:add-circle-bold-duotone'
                "
                class="h-[18px] w-[18px]"
              />
            </button>
          </div>
        </template>

        <!--
          버튼 영역 (호버 시 표시).

          ⋮는 우클릭 메뉴와 같은 항목을 연다. 우클릭만 두면 폴더 열기·상세
          정보·재스캔이 있다는 걸 알 방법이 없다.
        -->
        <template #actions>
          <Button
            size="icon-sm"
            variant="secondary"
            :title="book.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'"
            @click.stop="toggleFavorite"
          >
            <Icon
              :icon="
                book.is_favorite
                  ? 'solar:heart-broken-line-duotone'
                  : 'solar:heart-bold-duotone'
              "
              class="h-4 w-4"
            />
          </Button>
          <Button
            size="icon-sm"
            variant="secondary"
            title="미리보기"
            @click.stop="emit('show-preview', book)"
          >
            <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="secondary"
            title="새 창으로 열기"
            @click.stop="openInNewWindow"
          >
            <Icon icon="solar:square-top-down-bold-duotone" class="h-4 w-4" />
          </Button>
          <BookCardMenuButton :items="menuItems" />
        </template>
      </CoverCardShell>
    </ContextMenuTrigger>

    <BookCardMenu :items="menuItems" />
  </ContextMenu>
</template>
