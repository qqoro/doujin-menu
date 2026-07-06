import { useLocalStorage } from "@vueuse/core";

// 삭제 확인 다이얼로그의 "영구 삭제" 체크 상태.
// 모든 삭제 다이얼로그가 공유하도록 모듈 레벨 싱글톤으로 유지하고 localStorage에 저장한다.
const permanentDelete = useLocalStorage("delete-book-permanent", false);

export function usePermanentDelete() {
  return { permanentDelete };
}
