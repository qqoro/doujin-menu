import { watch, onMounted, Ref } from "vue";
import { useRoute } from "vue-router";

export function useSearchPersistence(
  searchQuery: Ref<string>,
  storageKey: string,
) {
  const route = useRoute();

  // 컴포넌트 마운트 시 복원
  onMounted(() => {
    // URL 쿼리에 검색어가 있으면 localStorage 복원 건너뛰기
    if (route.query.schWord) {
      return;
    }

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      searchQuery.value = saved;
    }
  });

  // 검색어 변경 시 저장
  watch(searchQuery, (newValue) => {
    if (newValue) {
      localStorage.setItem(storageKey, newValue);
    } else {
      localStorage.removeItem(storageKey);
    }
  });
}
