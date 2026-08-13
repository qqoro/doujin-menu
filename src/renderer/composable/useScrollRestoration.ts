import { onActivated, onDeactivated, onUnmounted } from "vue";
import { useRoute } from "vue-router";

// 각 라우트별 스크롤 위치를 저장하는 전역 맵
const scrollPositions = new Map<string, number>();

/** 인덱스 모드용 저장소. 픽셀 모드와 섞이지 않게 따로 둡니다 */
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
 * 조건이 참이 될 때까지 기다렸다가 한 번만 실행합니다. 취소 함수를 반환합니다.
 *
 * **시간이 아니라 상태를 기다리는 게 핵심입니다.** 고정 `setTimeout`으로는
 * 안 됩니다 — `total`은 히토미 인덱스 fetch를 타는 IPC라 100ms 안에 올 리 없고,
 * 높이가 0인 상태에서 스크롤을 대입하면 브라우저가 0으로 클램프합니다. 게다가
 * 그 클램프가 `scroll` 이벤트를 발생시켜 저장값까지 0으로 덮어씁니다.
 *
 * 페이지를 바꾼 직후의 `scrollToIndex`도 같은 함정이라 이 함수를 공유합니다.
 * 새 창의 `count`가 virtualizer에 반영되기 전에 부르면 목표가 0이 됩니다.
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
    // 영원히 도는 걸 막습니다. 검색이 실패해 결과가 안 오는 경우가 있습니다
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
 * **픽셀 오프셋 저장은 가상 스크롤에서 못 씁니다.** 열 수가 창 너비와 줌의
 * 함수라, 다른 화면에 있는 동안 창을 리사이즈하면 같은 픽셀이 전혀 다른 항목을
 * 가리킵니다. 첫 보이는 항목의 인덱스를 저장하고 `scrollToIndex`로 되돌립니다.
 *
 * 기존 픽셀 모드(`useScrollRestoration`)는 그대로 두고 이건 옵트인입니다.
 * 라이브러리·시리즈 화면은 계속 픽셀 모드를 씁니다.
 */
export function useIndexScrollRestoration(options: {
  /** 지금 위치를 읽습니다. 아직 못 읽으면 null */
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

  // 스크롤 이벤트 핸들러
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    scrollPositions.set(routeName, target.scrollTop);
  };

  // 스크롤 이벤트 리스너 등록
  const attachScrollListener = () => {
    // 컨테이너 요소 찾기
    scrollElement = document.querySelector(containerSelector);

    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
    }
  };

  // 스크롤 이벤트 리스너 제거
  const detachScrollListener = () => {
    if (scrollElement) {
      scrollElement.removeEventListener("scroll", handleScroll);
      scrollElement = null;
    }
  };

  // 스크롤 위치 복원 또는 초기화
  const restoreScroll = () => {
    const savedScrollTop = scrollPositions.get(routeName) || 0;

    // 약간의 딜레이 후 스크롤 복원 (DOM 렌더링 대기)
    setTimeout(() => {
      scrollElement = document.querySelector(containerSelector);
      if (scrollElement) {
        scrollElement.scrollTop = savedScrollTop;
      }
    }, 100);
  };

  // 페이지가 활성화될 때
  onActivated(() => {
    attachScrollListener();
    restoreScroll();
  });

  // 페이지가 비활성화될 때
  onDeactivated(() => {
    detachScrollListener();
  });

  return {
    scrollTop: () => scrollPositions.get(routeName) || 0,
  };
}
