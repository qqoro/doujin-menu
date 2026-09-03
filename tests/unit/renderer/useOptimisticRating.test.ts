import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useOptimisticRating } from "../../../src/renderer/composables/useOptimisticRating";

const toastError = vi.fn();
vi.mock("vue-sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

type TestBook = { id: number; rating?: number };

describe("useOptimisticRating", () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it("책의 별점으로 시작한다", () => {
    const book = ref<TestBook | null>({ id: 1, rating: 3 });
    const { rating } = useOptimisticRating(() => book.value, vi.fn());

    expect(rating.value).toBe(3);
  });

  it("별점이 없는 책은 미평가(0)로 본다", () => {
    const book = ref<TestBook | null>({ id: 1 });
    const { rating } = useOptimisticRating(() => book.value, vi.fn());

    expect(rating.value).toBe(0);
  });

  it("점수를 매기면 저장을 기다리지 않고 먼저 보여준다", async () => {
    const book = ref<TestBook | null>({ id: 7, rating: 0 });
    const save = vi.fn().mockResolvedValue(undefined);
    const { rating, setRating } = useOptimisticRating(() => book.value, save);

    const pending = setRating(4);

    expect(rating.value).toBe(4);
    await pending;
    expect(save).toHaveBeenCalledWith(7, 4);
  });

  it("다른 책으로 바뀌면 앞 책에 매긴 값이 남지 않는다", async () => {
    // 앞 책과 새 책의 점수가 둘 다 0이라, 별점 "값"만 감시하면 감시가 돌지 않아
    // 앞 책에 매긴 5점이 새 책에 그대로 보인다
    const book = ref<TestBook | null>({ id: 1, rating: 0 });
    const save = vi.fn().mockResolvedValue(undefined);
    const { rating, setRating } = useOptimisticRating(() => book.value, save);

    await setRating(5);
    expect(rating.value).toBe(5);

    book.value = { id: 2, rating: 0 };
    await nextTick();

    expect(rating.value).toBe(0);
  });

  it("같은 책의 최신 별점이 내려오면 그 값을 따른다", async () => {
    const book = ref<TestBook | null>({ id: 1, rating: 0 });
    const { rating } = useOptimisticRating(() => book.value, vi.fn());

    // 목록을 다시 받아오면 같은 책이라도 새 객체로 들어온다
    book.value = { id: 1, rating: 2 };
    await nextTick();

    expect(rating.value).toBe(2);
  });

  it("책이 없으면 저장하지 않는다", async () => {
    const book = ref<TestBook | null>(null);
    const save = vi.fn();
    const { setRating } = useOptimisticRating(() => book.value, save);

    await setRating(3);

    expect(save).not.toHaveBeenCalled();
  });

  it("저장이 실패하면 되돌리고 알린다", async () => {
    const book = ref<TestBook | null>({ id: 1, rating: 2 });
    const save = vi.fn().mockRejectedValue(new Error("디스크 오류"));
    const { rating, setRating } = useOptimisticRating(() => book.value, save);

    await setRating(5);

    expect(rating.value).toBe(2);
    expect(toastError).toHaveBeenCalled();
  });
});
