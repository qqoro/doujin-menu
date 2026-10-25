<script setup lang="ts">
import TagBadge from "@/components/common/TagBadge.vue";
import type { MetaPart } from "@/lib/cardLayout";
import type { DetailRow, DetailRowKey } from "@/lib/galleryCard";
import { Icon } from "@iconify/vue";
import { toast } from "vue-sonner";
import MetaLine from "./MetaLine.vue";

/**
 * 책 정보 창의 위쪽 패널. 라이브러리 책과 다운로더 갤러리가 같은 줄을 그리고,
 * 표지·라이브러리 전용 정보·버튼만 슬롯으로 받는다.
 */
defineProps<{
  title: string;
  metaParts: MetaPart[];
  rows: DetailRow[];
}>();

const ROW_META: Record<DetailRowKey, { label: string; icon: string }> = {
  id: { label: "Hitomi ID", icon: "solar:hashtag-linear" },
  artist: { label: "작가", icon: "solar:pen-new-round-linear" },
  series: { label: "시리즈", icon: "solar:bookmark-linear" },
  type: { label: "유형", icon: "solar:notebook-linear" },
  language: { label: "언어", icon: "solar:global-linear" },
  group: { label: "그룹", icon: "solar:users-group-rounded-linear" },
  tag: { label: "태그", icon: "solar:tag-linear" },
  character: { label: "캐릭터", icon: "solar:user-linear" },
};

const copyTerm = async (term: string) => {
  const text = term.replaceAll(" ", "_");
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${text}가 클립보드에 복사되었습니다.`, { duration: 750 });
  } catch {
    toast.error("복사 실패");
  }
};
</script>

<template>
  <!-- 태그가 많은 책에서 미리보기 자리를 다 먹지 않도록 높이를 묶고 정보 줄만 스크롤한다 -->
  <div class="mb-4 flex max-h-[45vh] shrink-0 gap-5">
    <div
      class="relative w-44 shrink-0 self-start overflow-hidden rounded-lg max-sm:w-24"
    >
      <slot name="cover" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 오른쪽 위 닫기 버튼과 겹치지 않게 비워 둔다 -->
      <h2 class="pr-8 text-lg leading-snug font-bold break-all">
        {{ title }}
      </h2>
      <MetaLine class="text-muted-foreground mt-1" :parts="metaParts" />

      <div class="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        <template v-if="rows.length > 0">
          <dl class="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <template v-for="row in rows" :key="row.key">
              <dt class="text-muted-foreground flex items-center gap-1.5">
                <Icon
                  :icon="ROW_META[row.key].icon"
                  class="h-3.5 w-3.5 shrink-0"
                />
                {{ ROW_META[row.key].label }}
              </dt>
              <dd class="flex min-w-0 flex-wrap gap-1">
                <!-- 태그 외 줄은 종류 접두어가 이름에 찍히지 않도록 객체로 넘긴다 -->
                <TagBadge
                  v-for="item in row.items"
                  :key="item.term"
                  :tag="
                    row.key === 'tag'
                      ? item.term
                      : { type: row.key, name: item.text }
                  "
                  :title="
                    row.key === 'id'
                      ? '클릭: 검색어 복사'
                      : '클릭: 검색어 복사 · 우클릭: 제외 검색어 복사'
                  "
                  @click="copyTerm(item.term)"
                  @contextmenu.prevent="
                    row.key !== 'id' && copyTerm(`-${item.term}`)
                  "
                />
              </dd>
            </template>
          </dl>
        </template>

        <slot name="extras" />
      </div>

      <div
        class="mt-3 flex shrink-0 items-center justify-end gap-3 empty:hidden"
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
