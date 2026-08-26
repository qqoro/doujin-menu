<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useBookCard } from "@/composables/useBookCard";
import { useTagDisplay } from "@/composables/useTagDisplay";
import { buildBookMetaLine } from "@/lib/bookCard";
import type { CreditPrefix, MetaField } from "@/lib/cardLayout";
import { Icon } from "@iconify/vue";
import { computed } from "vue";
import type { Book } from "../../../types/ipc";
import BookCardMenu from "./parts/BookCardMenu.vue";
import BookCardMenuButton from "./parts/BookCardMenuButton.vue";
import CreditsLine from "./parts/CreditsLine.vue";
import MetaLine from "./parts/MetaLine.vue";
import RowCardShell from "./parts/RowCardShell.vue";

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
  "selectSeries",
  "selectCharacter",
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
const META_FIELDS: MetaField[] = ["pages", "type", "language", "date", "id"];

const {
  isOffline,
  openInNewWindow,
  handleCardClick,
  coverUrl,
  credits,
  requestDelete,
  menuItems,
} = useBookCard(props, emit);

const metaParts = computed(() => buildBookMetaLine(props.book, META_FIELDS));

/** 크레딧 클릭은 그 이름으로 필터를 건다. 다운로더는 같은 자리에서 복사를 한다 */
const CREDIT_EVENT = {
  artist: "selectArtist",
  group: "selectGroup",
  series: "selectSeries",
  character: "selectCharacter",
} as const satisfies Record<CreditPrefix, string>;

const handleCreditSelect = (credit: { prefix: CreditPrefix; name: string }) => {
  emit(CREDIT_EVENT[credit.prefix], credit.name);
};
</script>

<template>
  <ContextMenu>
    <!-- as-child로 카드 자체를 트리거로 쓴다. 셸(RowCardShell)이 단일 루트
         컴포넌트라 트리거 프롭이 셸 루트로 전달된다. 래퍼가 하나 더 생기면 행
         높이 실측(measureElement)이 그 래퍼를 재게 되어 여백이 어긋난다 -->
    <ContextMenuTrigger as-child>
      <RowCardShell
        :cover-url="coverUrl"
        :alt="book.title"
        :is-offline="isOffline"
        :is-favorite="!!book.is_favorite"
        @click="handleCardClick"
      >
        <template #content>
          <h3 class="text-[15px] leading-snug font-bold">{{ book.title }}</h3>

          <MetaLine class="text-muted-foreground" :parts="metaParts" />

          <CreditsLine
            class="text-muted-foreground text-[12.5px]"
            :credits="credits"
            @select="handleCreditSelect"
          />

          <div v-if="!hideTags" class="flex flex-wrap gap-1">
            <Badge
              v-for="tag in book.tags"
              :key="tag.name"
              :class="getTagDisplayInfo(tag).className"
              @click.stop="emit('selectTag', tag.name)"
              @contextmenu.prevent.stop="emit('excludeTag', tag.name)"
            >
              {{ getTagDisplayInfo(tag).displayText }}
            </Badge>
          </div>
        </template>

        <!--
          버튼 열. 자주 쓰는 셋과 ⋮만 둔다. 나머지(즐겨찾기·폴더·상세·재스캔·
          외부 뷰어)는 "더보기"가 여는 메뉴에 있고, 그 메뉴는 우클릭 메뉴와
          같은 항목이다. 일곱 개를 세로로 쌓으면 카드 높이를 버튼 열이
          정해버려서 표지보다 버튼이 먼저 눈에 들어온다.

          폭을 `w-[92px]`로 고정해 문구 길이에 따라 본문 폭이 흔들리지 않게 한다.
        -->
        <template #actions>
          <div class="flex w-[92px] shrink-0 flex-col gap-1.5">
            <Button
              size="sm"
              variant="outline"
              @click.stop="emit('show-preview', book)"
            >
              <Icon icon="solar:eye-bold-duotone" class="h-4 w-4" />
              미리보기
            </Button>
            <Button size="sm" @click.stop="openInNewWindow">
              <Icon icon="solar:square-top-down-bold-duotone" class="h-4 w-4" />
              새 창
            </Button>
            <BookCardMenuButton variant="labeled" :items="menuItems" />
            <Button size="sm" variant="destructive" @click.stop="requestDelete">
              <Icon
                icon="solar:trash-bin-minimalistic-bold-duotone"
                class="h-4 w-4"
              />
              삭제
            </Button>
          </div>
        </template>
      </RowCardShell>
    </ContextMenuTrigger>

    <BookCardMenu :items="menuItems" />
  </ContextMenu>
</template>
