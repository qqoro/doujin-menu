import { onActivated, onDeactivated } from "vue";
import { useRoute } from "vue-router";

// 각 라우트별 스크롤 위치를 저장하는 전역 맵
const scrollPositions = new Map<string, number>();

// 특정 라우트의 스크롤 위치를 초기화하는 함수
export function clearScrollPosition(routeName: string) {
  scrollPositions.delete(routeName);
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
