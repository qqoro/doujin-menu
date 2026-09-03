// @vitest-environment jsdom
/**
 * 별점은 카드 표지 위에 얹힌다. 클릭이 카드로 새어 나가면 별을 누를 때마다
 * 뷰어가 열리므로, 전파 차단이 이 컴포넌트에서 가장 중요한 동작이다.
 */
import { describe, expect, it } from "vitest";
import { createApp, h, nextTick } from "vue";
import StarRating from "../../../src/renderer/components/feature/parts/StarRating.vue";

const mountRating = (props: Record<string, unknown> = {}) => {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);

  const emitted: number[] = [];
  let cardClicks = 0;

  // 카드 역할을 하는 바깥 래퍼. 전파가 새면 여기서 잡힌다
  const app = createApp({
    render: () =>
      h(
        "div",
        { onClick: () => cardClicks++ },
        h(StarRating, {
          ...props,
          "onUpdate:modelValue": (value: number) => emitted.push(value),
        }),
      ),
  });
  app.mount(host);

  const stars = Array.from(host.querySelectorAll<HTMLElement>("[data-star]"));
  return { app, host, stars, emitted, cardClicks: () => cardClicks };
};

const filledCount = (stars: HTMLElement[]) =>
  stars.filter((star) => star.dataset.filled === "true").length;

describe("StarRating", () => {
  it("항상 별 5개를 그린다", () => {
    const { stars } = mountRating();
    expect(stars).toHaveLength(5);
  });

  it("미평가(0)면 채워진 별이 없다", () => {
    const { stars } = mountRating({ modelValue: 0 });
    expect(filledCount(stars)).toBe(0);
  });

  it("값만큼 별이 채워진다", () => {
    const { stars } = mountRating({ modelValue: 3 });
    expect(filledCount(stars)).toBe(3);
  });

  it("별을 누르면 그 점수를 올린다", async () => {
    const { stars, emitted } = mountRating({ modelValue: 0 });

    stars[3].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(emitted).toEqual([4]);
  });

  it("현재 점수와 같은 별을 다시 누르면 해제된다", async () => {
    const { stars, emitted } = mountRating({ modelValue: 3 });

    stars[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(emitted).toEqual([0]);
  });

  it("클릭이 카드로 전파되지 않는다", async () => {
    const { stars, cardClicks } = mountRating({ modelValue: 0 });

    stars[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(cardClicks()).toBe(0);
  });

  it("readonly면 값을 바꾸지 않고 클릭을 카드로 흘려보낸다", async () => {
    const { stars, emitted, cardClicks } = mountRating({
      modelValue: 2,
      readonly: true,
    });

    stars[4].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(emitted).toEqual([]);
    expect(cardClicks()).toBe(1);
  });

  it("호버하면 누를 결과를 미리 보여준다", async () => {
    const { stars } = mountRating({ modelValue: 1 });

    stars[3].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await nextTick();

    expect(filledCount(stars)).toBe(4);
  });

  it("readonly면 호버해도 미리보기가 뜨지 않는다", async () => {
    const { stars } = mountRating({ modelValue: 1, readonly: true });

    stars[3].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await nextTick();

    expect(filledCount(stars)).toBe(1);
  });
});
