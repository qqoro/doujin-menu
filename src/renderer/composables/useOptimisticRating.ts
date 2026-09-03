import { ref, watch } from "vue";
import { toast } from "vue-sonner";

interface RatableBook {
  id: number;
  rating?: number;
}

/**
 * 별점을 저장이 끝나기 전에 먼저 보여주고, 실패하면 되돌린다.
 *
 * 감시 대상은 별점 값이 아니라 **책 자체**다. 값만 보면 앞 책과 새 책의 점수가
 * 같을 때(둘 다 미평가가 흔하다) 감시가 돌지 않아, 앞 책에 매긴 점수가 다음
 * 책에 그대로 남는다. 카드는 가상 스크롤로 재활용되고 상세 모달은 하나를
 * 돌려 쓰므로 둘 다 이 경로를 탄다.
 *
 * @param source 지금 보고 있는 책. 없으면 null
 * @param save 실제 저장. 목록 무효화까지 호출부가 맡는다
 */
export function useOptimisticRating(
  source: () => RatableBook | null | undefined,
  save: (bookId: number, value: number) => Promise<unknown>,
) {
  const rating = ref(source()?.rating ?? 0);

  watch(source, (book) => {
    rating.value = book?.rating ?? 0;
  });

  const setRating = async (value: number) => {
    const book = source();
    if (!book) return;

    const previous = rating.value;
    rating.value = value;
    try {
      await save(book.id, value);
    } catch (error) {
      rating.value = previous;
      toast.error("별점 저장 실패", {
        description: (error as Error).message,
      });
    }
  };

  return { rating, setRating };
}
