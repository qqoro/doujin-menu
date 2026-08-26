import { onActivated, onDeactivated, onUnmounted } from "vue";
import { useRoute } from "vue-router";

// 각 라우트별 스크롤 위치를 저장하는 전역 맵
const scrollPositions = new Map<string, number>();

/** 인덱스 모드용 저장소. 픽셀 모드와 섞이지 않게 따로 둔다 */
const indexPositions = new Map<string, IndexPosition>();

// 특정 라우트의 스크롤 위치를 초기화하는 함수
export function clearScrollPosition(routeName: string) {
  scrollPositions.delete(routeName);
  indexPositions.delete(routeName);
}

export interface IndexPosition {
  /** 다운로더의 PAGE 단위 페이지 번호 */
  page: number;
  /** 그 페이지 안에서 첫 보이는 항목의 인덱스 */
  index: number;
}

/**
 * 조건이 참이 될 때까지 기다렸다가 한 번만 실행한다. 취소 함수를 반환한다.
 *
 * 시간이 아니라 상태를 기다려야 한다. 높이가 0인 상태에서 스크롤을 대입하면
 * 브라우저가 0으로 클램프하고, 그 클램프가 `scroll` 이벤트를 일으켜 저장값까지
 * 0으로 덮어쓴다.
 */
export function runWhenReady(
  ready: () => boolean,
  action: () => void,
  { timeoutMs = 5000 }: { timeoutMs?: number } = {},
): () => void {
  let cancelled = false;
  const deadline = performance.now() + timeoutMs;

  const tick = () => {
    if (cancelled) return;
    if (ready()) {
      action();
      return;
    }
    // 검색이 실패해 결과가 영영 안 오는 경우가 있다
    if (performance.now() > deadline) return;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  return () => {
    cancelled = true;
  };
}

/**
 * 인덱스 기반 스크롤 복원.
 *
 * 픽셀 오프셋은 가상 스크롤에서 못 쓴다. 열 수가 창 너비와 줌의 함수라, 다른
 * 화면에 있는 동안 리사이즈하면 같은 픽셀이 다른 항목을 가리킨다. 첫 보이는
 * 항목의 인덱스를 저장하고 `scrollToIndex`로 되돌린다.
 */
export function useIndexScrollRestoration(options: {
  /** 지금 위치를 읽는다. 아직 못 읽으면 null */
  capture: () => IndexPosition | null;
  /** 복원해도 되는 상태인지 (높이가 잡혔는지) */
  ready: () => boolean;
  /** 실제 복원 */
  restore: (saved: IndexPosition) => void;
}) {
  const route = useRoute();
  const routeName = route.name as string;

  let cancel: (() => void) | null = null;

  const stopPending = () => {
    cancel?.();
    cancel = null;
  };

  onActivated(() => {
    const saved = indexPositions.get(routeName);
    if (!saved) return;

    stopPending();
    cancel = runWhenReady(options.ready, () => options.restore(saved));
  });

  onDeactivated(() => {
    stopPending();
    const captured = options.capture();
    if (captured) indexPositions.set(routeName, captured);
  });

  onUnmounted(stopPending);

  return {
    saved: () => indexPositions.get(routeName) ?? null,
  };
}

// 스크롤 위치를 저장하고 복원하는 컴포저블
export function useScrollRestoration(containerSelector: string) {
  const route = useRoute();
  const routeName = route.name as string;

  let scrollElement: HTMLElement | null = null;

  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    scrollPositions.set(routeName, target.scrollTop);
  };

  const attachScrollListener = () => {
    scrollElement = document.querySelector(containerSelector);

    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
    }
  };

  const detachScrollListener = () => {
    if (scrollElement) {
      scrollElement.removeEventListener("scroll", handleScroll);
      scrollElement = null;
    }
  };

  const restoreScroll = () => {
    const savedScrollTop = scrollPositions.get(routeName) || 0;

    // DOM 렌더링을 기다린다
    setTimeout(() => {
      scrollElement = document.querySelector(containerSelector);
      if (scrollElement) {
        scrollElement.scrollTop = savedScrollTop;
      }
    }, 100);
  };

  onActivated(() => {
    attachScrollListener();
    restoreScroll();
  });

  onDeactivated(() => {
    detachScrollListener();
  });

  return {
    scrollTop: () => scrollPositions.get(routeName) || 0,
  };
}
