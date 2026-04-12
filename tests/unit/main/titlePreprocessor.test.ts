import { describe, expect, it } from "vitest";
import { preprocessTitle } from "../../../src/main/services/seriesDetection/titlePreprocessor";

describe("titlePreprocessor/preprocessTitle", () => {
  it("전각 숫자를 반각으로 변환해야 합니다", () => {
    expect(preprocessTitle("１２３")).toBe("123");
    expect(preprocessTitle("시리즈 ２화")).toBe("시리즈 2화");
  });

  it("전각 괄호를 반각으로 변환해야 합니다", () => {
    expect(preprocessTitle("（테스트）")).toBe("(테스트)");
    expect(preprocessTitle("［시리즈］")).toBe("[시리즈]");
  });

  it("전각 공백을 일반 공백으로 변환해야 합니다", () => {
    expect(preprocessTitle("시리즈　１화")).toBe("시리즈 1화");
  });

  it("장식 문자를 제거해야 합니다", () => {
    expect(preprocessTitle("★테스트♡")).toBe("테스트");
    expect(preprocessTitle("☆시리즈 1♪")).toBe("시리즈 1");
  });

  it("연속 공백을 하나로 정리해야 합니다", () => {
    expect(preprocessTitle("테스트   시리즈")).toBe("테스트 시리즈");
    expect(preprocessTitle("  시리즈  1  ")).toBe("시리즈 1");
  });

  it("통합 전처리가 올바르게 동작해야 합니다", () => {
    // 전각 + 장식문자 + 공백 조합
    expect(preprocessTitle("★　１２３화♡")).toBe("123화");
  });

  it("빈 문자열과 일반 문자열은 그대로 반환해야 합니다", () => {
    expect(preprocessTitle("")).toBe("");
    expect(preprocessTitle("일반 제목")).toBe("일반 제목");
    expect(preprocessTitle("Series 1")).toBe("Series 1");
  });

  it("전각 영문을 반각으로 변환해야 합니다", () => {
    expect(preprocessTitle("Ｖｏｌ．１")).toBe("Vol.1");
  });

  it("물결표 연속 사용을 정리해야 합니다", () => {
    expect(preprocessTitle("제목~~")).toBe("제목");
    expect(preprocessTitle("제목~~~부제")).toBe("제목 부제");
  });
});
