/**
 * 카드 목록 화면(라이브러리·읽음 기록·시리즈…)이 공유하는 가상 스크롤 골격.
 * 화면마다 다른 건 무엇을 어떻게 가져오는지뿐이고, 배치·줌·스크롤은 같다.
 *
 * DOM 계층을 바꾸지 말 것:
 *
 *   .{page}-scroller  ← overflow-y:auto, zoom 없음. scrollTop은 실제 px
 *     └ .vspace       ← 총 높이 스페이서. zoom 없음
 *         └ .row      ← 측정 대상. zoom 없음. top = virtualRow.start
 *             └ .zoomed ← style="zoom: z". 카드만 이 안에
 *
 * 그리드는 행 높이를 실측해야 해서 행을 zoom 밖에 둔다. zoom 아래에서는
 * measureElement가 보는 borderBoxSize와 getBoundingClientRect가 1/z만큼 어긋난다.
 *
 * 다운로더는 PAGE 단위 구간 나누기와 generation 처리가 얽혀 있어 이 훅을 쓰지
 * 않는다 (`downloaderVirtual.ts` 참고).
 */
import { useQueries, useQuery } from "@tanstack/vue-query";
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
  chunksForRange,
  computeCols,
  computeListCols,
  shouldShowSkeleton,
  usableGridWidth,
} from "@/lib/virtualList";
import { BOOK_ASPECT, listRowEstimate } from "@/lib/cardLayout";
import { useUiStore } from "@/store/uiStore";
import { computed, onUnmounted, ref, watch, type Ref } from "vue";
import { useIndexScrollRestoration } from "./useScrollRestoration";
import { useZoomWheel } from "./useZoomWheel";

export interface VirtualCardListOptions<T> {
  /** 뷰 모드. 훅은 읽기만 한다 (저장은 화면이 한다) */
  viewMode: Ref<"grid" | "list">;
  /** 전체 항목 수. 스크롤러 총 높이를 잡는 메타 조회(1건)가 쓴다 */
  fetchTotal: () => Promise<number>;
  /** chunkIndex 번째 청크(0부터, CHUNK_SIZE개 단위)를 가져온다 */
  fetchChunk: (chunkIndex: number) => Promise<T[]>;
  /** 총 건수 메타 조회의 쿼리 키 */
  metaKey: () => readonly unknown[];
  /** 청크 조회의 쿼리 키. 청크는 전체 결과 기준의 절대 번호으로 캐시된다 */
  chunkKey: (chunkIndex: number) => readonly unknown[];
  /** 결과가 바뀌는 원인(예: 검색 필터). 바뀌면 첫 렌더 전 스켈레톤 상태로 되돌린다 */
  resetKey?: () => unknown;
  /** 표지 세로/가로 비율 (기본: 라이브러리 2:3) */
  aspect?: number;
  /** 청크 하나에 담는 항목 수 (기본 50). fetchChunk의 pageSize와 같아야 한다 */
  chunkSize?: number;
}

export function useVirtualCardList<T>(options: VirtualCardListOptions<T>) {
  const uiStore = useUiStore();
  const aspect = options.aspect ?? BOOK_ASPECT;

  // 스크롤러 폭 → 열 수
  const scrollerRef = ref<HTMLElement | null>(null);
  const scrollerWidth = ref(0);

  const GRID_PADDING = 0; // 스크롤러에 좌우 패딩 없음
  const GRID_GAP = 12; // gap-3
  const MIN_CARD_WIDTH = 184; // minmax(184px, 1fr)
  const LIST_GAP = 8; // 리스트 카드 사이 간격 (pb-2와 맞춘다)
  const MIN_LIST_CARD_WIDTH = 560;

  const gridCols = computed(() =>
    computeCols(
      scrollerWidth.value,
      uiStore.thumbnailZoom,
      GRID_PADDING,
      GRID_GAP,
      MIN_CARD_WIDTH,
    ),
  );

  const listCols = computed(() =>
    computeListCols(
      scrollerWidth.value,
      uiStore.thumbnailZoom,
      GRID_PADDING,
      LIST_GAP,
      MIN_LIST_CARD_WIDTH,
    ),
  );

  const activeCols = computed(() =>
    options.viewMode.value === "grid" ? gridCols.value : listCols.value,
  );

  /**
   * 그리드 행의 추정 높이. 카드가 표지 한 장에 정보를 오버레이로 얹는 형태라
   * 높이가 폭으로 확정된다. `usableGridWidth`는 zoom 안쪽 단위 공간을 주는데 행
   * 래퍼는 zoom 바깥이라 다시 곱해 실제 px로 되돌린다.
   */
  const gridRowEstimate = computed(() => {
    const cols = Math.max(1, gridCols.value);
    const unitWidth =
      (usableGridWidth(
        scrollerWidth.value,
        uiStore.thumbnailZoom,
        GRID_PADDING,
      ) -
        GRID_GAP * (cols - 1)) /
      cols;
    if (unitWidth <= 0) return 300;
    return (unitWidth * aspect + GRID_GAP) * uiStore.thumbnailZoom;
  });

  // 총 건수 메타 조회. 스크롤러 높이를 잡으려면 청크가 오기 전에 총 건수가
  // 필요해 1건만 따로 요청한다. 첫 청크 응답의 총 건수를 재사용하면 조건이 바뀔
  // 때 모든 청크가 새 키가 되면서 총 건수가 잠시 비어 스페이서가 무너진다.
  const { data: metaData, isLoading: isMetaLoading } = useQuery({
    queryKey: computed(() => options.metaKey()),
    queryFn: () => options.fetchTotal(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const totalCount = computed(() => metaData.value ?? 0);

  /** 청크 하나에 담는 항목 수. fetchChunk의 pageSize와 같은 값이 와야 한다 */
  const CHUNK_SIZE = options.chunkSize ?? 50;

  // 보이는 절대 인덱스 범위를 CHUNK_SIZE 단위로 나눠 필요한 것만 조회한다
  const visibleAbsRange = ref<{ start: number; end: number } | null>(null);

  const activeChunks = computed(() => {
    if (totalCount.value === 0) return [];

    // 가상 스크롤러가 아직 범위를 못 정한 초기 상태에서는 첫 청크를 쓴다
    const range = visibleAbsRange.value ?? { start: 0, end: CHUNK_SIZE - 1 };
    return chunksForRange(
      Math.max(0, range.start),
      Math.min(totalCount.value - 1, range.end),
      CHUNK_SIZE,
    );
  });

  const chunkQueries = useQueries({
    queries: computed(() =>
      activeChunks.value.map((chunkIndex) => ({
        queryKey: options.chunkKey(chunkIndex),
        queryFn: async () => ({
          chunkIndex,
          items: await options.fetchChunk(chunkIndex),
        }),
        // 기본값(staleTime 0)이면 청크가 화면에 다시 들어올 때마다 백그라운드
        // refetch가 돈다. 위아래로 10회만 왕복해도 수백 번의 IPC가 된다.
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
      })),
    ),
  });

  /** 절대 인덱스 → 항목. 아직 안 온 자리는 undefined */
  const loadedItems = computed(() => {
    const map = new Map<number, T>();
    for (const q of chunkQueries.value) {
      const data = q.data;
      if (!data) continue;
      data.items.forEach((item, i) => {
        map.set(data.chunkIndex * CHUNK_SIZE + i, item);
      });
    }
    return map;
  });

  const itemAt = (index: number) => loadedItems.value.get(index);

  /** 화면에 실제로 그려진 적이 있는지. 전체 스켈레톤을 첫 렌더 전까지만 쓴다 */
  const hasRendered = ref(false);
  watch(loadedItems, (map) => {
    if (map.size > 0) hasRendered.value = true;
  });
  watch(
    () => options.resetKey?.(),
    () => {
      hasRendered.value = false;
    },
  );

  const isLoading = computed(() =>
    shouldShowSkeleton({
      searchStarted: true,
      isMetaLoading: isMetaLoading.value,
      total: totalCount.value,
      hasRendered: hasRendered.value,
    }),
  );

  const rowCount = computed(() =>
    Math.ceil(totalCount.value / Math.max(1, activeCols.value)),
  );

  const gridVirtualizer = useVirtualizer(
    computed(() => ({
      count: options.viewMode.value === "grid" ? rowCount.value : 0,
      getScrollElement: () => scrollerRef.value,
      estimateSize: () => gridRowEstimate.value,
      overscan: 2,
    })),
  );

  const listVirtualizer = useVirtualizer(
    computed(() => ({
      count: options.viewMode.value === "list" ? rowCount.value : 0,
      getScrollElement: () => scrollerRef.value,
      // 리스트 썸네일이 줌을 따라가므로 추정 높이도 같이 움직여야 한다.
      // 고정값이면 최소 줌에서 스크롤바가 실제보다 세 배 길어진다
      estimateSize: () => listRowEstimate(uiStore.thumbnailZoom, aspect),
      overscan: 3,
    })),
  );

  /**
   * 지금 쓰는 virtualizer. 절대 computed로 만들지 말 것.
   *
   * vue-virtual은 스크롤마다 `triggerRef`로 알리는데, Vue 3.4부터 computed는
   * 재계산 결과가 이전과 같으면 알림을 전파하지 않는다. 여기는 늘 같은 인스턴스를
   * 반환하므로 computed로 두면 파생 computed가 첫 값에서 영원히 멈춘다.
   */
  const getActiveVirtualizer = () =>
    options.viewMode.value === "grid"
      ? gridVirtualizer.value
      : listVirtualizer.value;

  const totalSize = computed(() => getActiveVirtualizer()?.getTotalSize() ?? 0);

  /** 보이는 절대 인덱스 범위. 청크 조회 대상을 정한다 (overscan 포함) */
  const updateVisibleRange = () => {
    const virtualizer = getActiveVirtualizer();
    if (!virtualizer || totalCount.value === 0) return;

    const items = virtualizer.getVirtualItems();
    if (items.length === 0) return;

    const lanes = Math.max(1, activeCols.value);
    const start = items[0].index * lanes;
    const end = Math.min(
      (items[items.length - 1].index + 1) * lanes - 1,
      totalCount.value - 1,
    );

    const prev = visibleAbsRange.value;
    if (prev && prev.start === start && prev.end === end) return;
    visibleAbsRange.value = { start, end };
  };

  watch(
    () => [
      getActiveVirtualizer()?.getVirtualItems().length,
      getActiveVirtualizer()?.range?.startIndex,
      totalCount.value,
      activeCols.value,
    ],
    updateVisibleRange,
    { immediate: true },
  );

  // 폭이 바뀌면 열 수가 바뀌고 행 수도 바뀐다
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

  // Ctrl+Wheel 줌. 그리드는 컨테이너 zoom, 리스트는 썸네일 px가 줌을 따라간다
  const { handleZoomWheel } = useZoomWheel();

  // 스크롤 위치 복원. 픽셀 저장은 못 쓴다 — 열 수가 창 너비와 줌의 함수라 다른
  // 화면에 있는 동안 리사이즈하면 같은 픽셀이 다른 항목을 가리킨다.
  //
  // 폭이 확정되기 전에 복원해서도 안 된다. keep-alive로 떼어져 있는 동안
  // ResizeObserver가 폭을 0으로 읽어 열 수가 1로 무너지고, 그 상태에서 복원하면
  // 열 수만큼 아래로 튄다.
  useIndexScrollRestoration({
    capture: () => {
      const virtualizer = getActiveVirtualizer();
      const startIndex = virtualizer?.range?.startIndex;
      if (startIndex === undefined) return null;
      return { index: startIndex * Math.max(1, activeCols.value), page: 0 };
    },
    ready: () =>
      totalCount.value > 0 &&
      !!getActiveVirtualizer() &&
      scrollerWidth.value > 0,
    restore: (saved) => {
      const lanes = Math.max(1, activeCols.value);
      getActiveVirtualizer()?.scrollToIndex(Math.floor(saved.index / lanes), {
        align: "start",
      });
    },
  });

  /** 리스트 스켈레톤 높이. 아직 청크가 안 온 자리의 껍데기가 쓴다 */
  const listSkeletonHeight = computed(
    () => listRowEstimate(uiStore.thumbnailZoom, aspect) - LIST_GAP,
  );

  return {
    // 템플릿이 직접 쓰는 값들
    scrollerRef,
    updateVisibleRange,
    handleZoomWheel,
    gridVirtualizer,
    listVirtualizer,
    gridCols,
    listCols,
    totalSize,
    totalCount,
    isLoading,
    itemAt,
    GRID_GAP,
    LIST_GAP,
    listSkeletonHeight,
  };
}
