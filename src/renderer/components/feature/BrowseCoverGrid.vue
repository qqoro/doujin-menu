<script setup lang="ts">
import { useZoomWheel } from "@/composables/useZoomWheel";
import { BOOK_ASPECT } from "@/lib/cardLayout";
import {
  computeCols,
  effectiveMinCardWidth,
  measuredRowHeight,
  usableGridWidth,
} from "@/lib/virtualList";
import { useUiStore } from "@/store/uiStore";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { computed, onUnmounted, ref, watch } from "vue";
import type { BrowseItem } from "../../../types/ipc";
import BrowseItemCard from "./BrowseItemCard.vue";

// 태그처럼 표지가 없는 목록도 받을 수 있게 cover_path를 선택으로 둔다
type GridItem = Omit<BrowseItem, "cover_path"> & { cover_path?: string | null };

const props = defineProps<{ items: GridItem[] }>();
const emit = defineEmits<{ select: [name: string] }>();

const uiStore = useUiStore();
const { handleZoomWheel } = useZoomWheel();

/**
 * 탐색은 목록 전체를 한 번에 받아 화면에서 거르므로 청크 조회 기반인
 * `useVirtualCardList`를 쓸 수 없다. 배치 상수와 DOM 계층은 그 훅과 같게 둔다.
 */
const GRID_GAP = 12;
const MIN_CARD_WIDTH = 184;

const scrollerRef = ref<HTMLElement | null>(null);
const scrollerWidth = ref(0);

const cols = computed(() =>
  computeCols(
    scrollerWidth.value,
    uiStore.thumbnailZoom,
    0,
    GRID_GAP,
    effectiveMinCardWidth(
      scrollerWidth.value,
      uiStore.thumbnailZoom,
      0,
      GRID_GAP,
      MIN_CARD_WIDTH,
    ),
  ),
);

const rowEstimate = computed(() => {
  const unitWidth =
    (usableGridWidth(scrollerWidth.value, uiStore.thumbnailZoom, 0) -
      GRID_GAP * (cols.value - 1)) /
    cols.value;
  if (unitWidth <= 0) return 300;
  return (unitWidth * BOOK_ASPECT + GRID_GAP) * uiStore.thumbnailZoom;
});

const rowCount = computed(() => Math.ceil(props.items.length / cols.value));

const itemAt = (index: number) => props.items[index];

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rowCount.value,
    getScrollElement: () => scrollerRef.value,
    estimateSize: () => rowEstimate.value,
    measureElement: (el: Element, entry: ResizeObserverEntry | undefined) =>
      measuredRowHeight(el, entry, rowEstimate.value),
    overscan: 2,
  })),
);

// 탭·검색어·정렬이 바뀌면 다른 목록이므로 맨 위에서 시작한다
watch(
  () => props.items,
  () => virtualizer.value.scrollToOffset(0),
);

let resizeObserver: ResizeObserver | null = null;
watch(scrollerRef, (el) => {
  resizeObserver?.disconnect();
  if (!el) return;
  scrollerWidth.value = el.clientWidth;
  resizeObserver = new ResizeObserver(() => {
    scrollerWidth.value = el.clientWidth;
  });
  resizeObserver.observe(el);
});
onUnmounted(() => resizeObserver?.disconnect());
</script>

<template>
  <!-- .vspace는 zoom 바깥, 카드만 행 안쪽 .zoomed에 들어간다 -->
  <div
    ref="scrollerRef"
    class="relative min-h-0 flex-grow overflow-y-auto"
    @wheel="handleZoomWheel"
  >
    <div
      class="vspace relative w-full"
      :style="{ height: `${virtualizer.getTotalSize()}px` }"
    >
      <div
        v-for="row in virtualizer.getVirtualItems()"
        :key="row.index"
        :ref="(el) => virtualizer.measureElement(el as Element)"
        :data-index="row.index"
        class="absolute inset-x-0 top-0"
        :style="{ transform: `translateY(${row.start}px)` }"
      >
        <div
          class="zoomed grid items-start"
          :style="{
            zoom: uiStore.thumbnailZoom,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: `${GRID_GAP}px`,
            paddingBottom: `${GRID_GAP}px`,
          }"
        >
          <template v-for="col in cols" :key="`${row.index}-${col}`">
            <BrowseItemCard
              v-if="itemAt(row.index * cols + col - 1)"
              :name="itemAt(row.index * cols + col - 1)!.name"
              :count="itemAt(row.index * cols + col - 1)!.count"
              :cover-path="itemAt(row.index * cols + col - 1)!.cover_path"
              @click="emit('select', itemAt(row.index * cols + col - 1)!.name)"
            />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
