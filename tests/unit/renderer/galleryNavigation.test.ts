import { describe, expect, it } from "vitest";
import {
  buildLanguageChips,
  popHistory,
  pushHistory,
  truncateHistory,
} from "@/lib/galleryNavigation";

const g = (id: number) => ({ id });

describe("이동 기록", () => {
  it("다른 갤러리는 뒤에 쌓는다", () => {
    expect(pushHistory([g(1)], g(2))).toEqual([g(1), g(2)]);
  });

  it("지금 보는 갤러리로 다시 이동하면 기록이 그대로다", () => {
    const stack = [g(1), g(2)];
    expect(pushHistory(stack, g(2))).toBe(stack);
  });

  it("뒤로가기는 한 단계를 빼고, 처음 갤러리에서는 그대로다", () => {
    expect(popHistory([g(1), g(2)])).toEqual([g(1)]);
    const root = [g(1)];
    expect(popHistory(root)).toBe(root);
  });

  it("경로 클릭은 그 단계까지만 남기고, 범위 밖이면 그대로다", () => {
    const stack = [g(1), g(2), g(3)];
    expect(truncateHistory(stack, 0)).toEqual([g(1)]);
    expect(truncateHistory(stack, 1)).toEqual([g(1), g(2)]);
    expect(truncateHistory(stack, 5)).toBe(stack);
    expect(truncateHistory(stack, -1)).toBe(stack);
  });
});

describe("buildLanguageChips", () => {
  const ja = { english: "japanese", local: "日本語" };
  const ko = { english: "korean", local: "한국어" };

  it("언어판이 자기 자신뿐이거나 없으면 칩을 만들지 않는다", () => {
    expect(buildLanguageChips(1, [])).toEqual([]);
    expect(buildLanguageChips(1, [{ id: 1, languageName: ja }])).toEqual([]);
  });

  it("지금 보는 언어판을 표시한다", () => {
    expect(
      buildLanguageChips(2, [
        { id: 1, languageName: ja },
        { id: 2, languageName: ko },
      ]),
    ).toEqual([
      { id: 1, label: "日本語", current: false },
      { id: 2, label: "한국어", current: true },
    ]);
  });

  it("현지어 이름이 없으면 영문, 둘 다 없으면 '알 수 없음'으로 쓴다", () => {
    const chips = buildLanguageChips(1, [
      { id: 1, languageName: { english: "english", local: "" } },
      { id: 2, languageName: null },
    ]);
    expect(chips.map((chip) => chip.label)).toEqual(["english", "알 수 없음"]);
  });

  it("같은 id가 두 번 오면 처음 것만 남긴다", () => {
    const chips = buildLanguageChips(1, [
      { id: 1, languageName: ja },
      { id: 2, languageName: ko },
      { id: 2, languageName: ko },
    ]);
    expect(chips.map((chip) => chip.id)).toEqual([1, 2]);
  });
});
