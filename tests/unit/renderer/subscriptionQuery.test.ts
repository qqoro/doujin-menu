import { describe, expect, it } from "vitest";
import {
  languageLabel,
  splitLanguage,
  withLanguage,
} from "../../../src/renderer/lib/subscriptionQuery";

describe("withLanguage", () => {
  it("검색어 앞에 언어 태그를 붙인다", () => {
    expect(withLanguage("korean", "artist:foo")).toBe(
      "language:korean artist:foo",
    );
  });

  it('"all"이면 언어를 붙이지 않는다', () => {
    expect(withLanguage("all", "artist:foo")).toBe("artist:foo");
  });

  it("검색어가 비어 있으면 언어 태그만 남긴다", () => {
    expect(withLanguage("korean", "  ")).toBe("language:korean");
    expect(withLanguage("all", "  ")).toBe("");
  });

  it("이미 언어를 직접 쓴 검색어는 덮어쓰지 않는다", () => {
    expect(withLanguage("korean", "language:japanese artist:foo")).toBe(
      "language:japanese artist:foo",
    );
  });

  it("앞뒤 공백을 정리한다", () => {
    expect(withLanguage("korean", "  artist:foo  ")).toBe(
      "language:korean artist:foo",
    );
  });
});

describe("splitLanguage", () => {
  it("언어 태그를 떼어내고 나머지를 돌려준다", () => {
    expect(splitLanguage("language:korean artist:foo tag:bar")).toEqual({
      language: "korean",
      rest: "artist:foo tag:bar",
    });
  });

  it("언어가 없으면 null이다", () => {
    expect(splitLanguage("artist:foo")).toEqual({
      language: null,
      rest: "artist:foo",
    });
  });

  it("검색어 중간에 있어도 떼어낸다", () => {
    expect(splitLanguage("artist:foo language:korean")).toEqual({
      language: "korean",
      rest: "artist:foo",
    });
  });

  it("제외 조건(-language:)은 검색 조건이므로 남긴다", () => {
    expect(splitLanguage("-language:korean artist:foo")).toEqual({
      language: null,
      rest: "-language:korean artist:foo",
    });
  });

  it("언어가 여러 개면 첫 번째만 언어로 본다", () => {
    expect(
      splitLanguage("language:korean language:japanese artist:foo"),
    ).toEqual({ language: "korean", rest: "language:japanese artist:foo" });
  });

  it("값이 없는 language:는 언어로 보지 않는다", () => {
    expect(splitLanguage("language: artist:foo")).toEqual({
      language: null,
      rest: "language: artist:foo",
    });
  });

  it("withLanguage로 붙인 것을 되돌린다", () => {
    const composed = withLanguage("japanese", "artist:foo");
    expect(splitLanguage(composed)).toEqual({
      language: "japanese",
      rest: "artist:foo",
    });
  });
});

describe("languageLabel", () => {
  it("한국어 이름으로 바꾼다", () => {
    expect(languageLabel("korean")).toBe("한국어");
    expect(languageLabel("all")).toBe("전체 언어");
  });

  it("목록에 없는 값은 그대로 둔다", () => {
    expect(languageLabel("spanish")).toBe("spanish");
  });
});
