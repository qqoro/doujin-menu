import { describe, expect, it, vi } from "vitest";

vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  computeComparisonKey,
  shouldGroupTitles,
} from "../../../src/main/services/seriesDetection/titlePatternMatcher";

describe("computeComparisonKey", () => {
  it("제목을 소문자 정규화해야 함", () => {
    const key = computeComparisonKey("Hello World");
    expect(key.full).toBe("hello world");
    expect(key.korean).toBeNull();
  });

  it("| 있는 제목은 한글 부분을 추출해야 함", () => {
    const key = computeComparisonKey("My Series | 나의 시리즈 1");
    expect(key.full).toBe("my series | 나의 시리즈 1");
    expect(key.korean).toBe("나의 시리즈 1");
  });

  it("| 뒤가 비어있으면 korean은 null", () => {
    const key = computeComparisonKey("English | ");
    expect(key.korean).toBeNull();
  });
});

describe("shouldGroupTitles", () => {
  const key = (full: string, korean: string | null = null) => ({
    full,
    korean,
  });
  const kg = (full: string, korean: string) => ({ full, korean });

  it("공통 접두사 < 3자면 다른 그룹", () => {
    expect(shouldGroupTitles(key("ab 1"), key("ab 2"))).toBe(false);
  });

  it("한쪽이 다른 쪽의 접두사면 같은 그룹", () => {
    expect(
      shouldGroupTitles(key("권 없는 시리즈"), key("권 없는 시리즈 2")),
    ).toBe(true);
  });

  it("숫자 제거 후 접미사 동일하면 같은 그룹", () => {
    expect(
      shouldGroupTitles(key("테스트 시리즈 1"), key("테스트 시리즈 2")),
    ).toBe(true);
  });

  it("숫자 제거 후 접미사 다르면 다른 그룹", () => {
    expect(shouldGroupTitles(key("시리즈 a 1"), key("시리즈 b 1"))).toBe(false);
  });

  it("둘 다 권수 있고 LCP 75%+면 같은 그룹", () => {
    expect(
      shouldGroupTitles(
        key("project 2024 vol. 1"),
        key("project 2024 3"),
        1,
        3,
      ),
    ).toBe(true);
  });

  it("권수 있어도 LCP 비율 낮으면 다른 그룹", () => {
    expect(shouldGroupTitles(key("시리즈 a 1"), key("시리즈 b 1"), 1, 1)).toBe(
      false,
    );
  });

  it("Yuzuri 케이스: 물결표+숫자없음", () => {
    const k1 = key(
      "yuzuri ai-utakata ~uraaka dom haken ol onaho choukyou~ 물거품 ~뒷계정 씹마조 파견 ol 오나홀조교~",
    );
    const k2 = key(
      "yuzuri ai-utakata 2 ~uraaka dom haken ol onaho choukyou~ 물거품 2 ~뒷계정 씹마조 파견 ol 오나홀조교~",
    );
    expect(shouldGroupTitles(k1, k2, null, 2)).toBe(true);
  });

  it("| 한글 부분 LCP가 더 길면 그것을 사용", () => {
    const k1 = kg("my series | 나의 시리즈 1", "나의 시리즈 1");
    const k2 = kg("my awesome series | 나의 시리즈 2", "나의 시리즈 2");
    expect(shouldGroupTitles(k1, k2, 1, 2)).toBe(true);
  });
});
