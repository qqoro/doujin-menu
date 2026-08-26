import { describe, expect, it } from "vitest";
import {
  normalizeQuery,
  parseSubscriptionQuery,
  validateSubscriptionQuery,
} from "../../../../src/main/services/subscription/query.js";

describe("normalizeQuery", () => {
  it("태그 순서가 달라도 같은 키가 된다", () => {
    expect(normalizeQuery("artist:a tag:b")).toBe(
      normalizeQuery("tag:b artist:a"),
    );
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(normalizeQuery("artist:foo ")).toBe(normalizeQuery("artist:foo"));
  });

  it("연속 공백을 하나로 본다", () => {
    expect(normalizeQuery("artist:foo  tag:x")).toBe(
      normalizeQuery("artist:foo tag:x"),
    );
  });

  it("소문자화하지 않는다", () => {
    // getParsedTags가 대문자를 거부하므로 artist:Foo는 실패해야 한다.
    // 소문자화하면 실패해야 할 검색이 성공한 검색과 같은 칸을 쓰게 된다
    expect(normalizeQuery("artist:Foo")).not.toBe(normalizeQuery("artist:foo"));
  });
});

describe("validateSubscriptionQuery", () => {
  it("양성 태그가 하나 있으면 통과", () => {
    expect(validateSubscriptionQuery("artist:foo").ok).toBe(true);
  });

  it("양성 태그가 여러 개여도 통과", () => {
    expect(validateSubscriptionQuery("artist:foo language:korean").ok).toBe(
      true,
    );
  });

  it("제목 단어만 있으면 거부", () => {
    const result = validateSubscriptionQuery("제목단어");
    expect(result.ok).toBe(false);
  });

  it("빈 문자열은 거부", () => {
    expect(validateSubscriptionQuery("").ok).toBe(false);
    expect(validateSubscriptionQuery("   ").ok).toBe(false);
  });

  it("음성 태그만 있으면 거부", () => {
    // 시작점이 없어 index-all 전량이 필요해진다
    expect(validateSubscriptionQuery("-male:yaoi").ok).toBe(false);
  });

  it("대문자가 섞인 태그는 거부", () => {
    expect(validateSubscriptionQuery("artist:Foo").ok).toBe(false);
  });

  it("거부 사유는 한국어 문장이다", () => {
    const result = validateSubscriptionQuery("제목단어");
    if (result.ok) throw new Error("거부되어야 한다");
    expect(result.reason).toMatch(/[가-힣]/);
  });
});

describe("parseSubscriptionQuery", () => {
  it("양성 태그를 positive로 모은다", () => {
    const parsed = parseSubscriptionQuery("artist:foo language:korean", []);

    expect(parsed.positive).toEqual([
      { type: "artist", name: "foo", isNegative: false },
      { type: "language", name: "korean", isNegative: false },
    ]);
  });

  it("이름의 밑줄을 공백으로 바꾼다 (getParsedTags 규칙)", () => {
    const parsed = parseSubscriptionQuery("artist:uzura_dobin", []);

    expect(parsed.positive[0].name).toBe("uzura dobin");
  });

  it("검색어의 음성 태그를 negative로 모은다", () => {
    const parsed = parseSubscriptionQuery("artist:foo -male:yaoi", []);

    expect(parsed.positive).toHaveLength(1);
    expect(parsed.negative).toHaveLength(1);
    expect(parsed.negative[0].name).toBe("yaoi");
  });

  it("차단 태그를 negative에 더한다", () => {
    const parsed = parseSubscriptionQuery("artist:foo", ["female:netorare"]);

    expect(parsed.negative).toHaveLength(1);
    expect(parsed.negative[0]).toMatchObject({
      type: "female",
      name: "netorare",
    });
  });

  it("유저가 명시한 태그가 차단 태그를 이긴다", () => {
    const parsed = parseSubscriptionQuery("male:yaoi", ["male:yaoi"]);

    expect(parsed.positive).toHaveLength(1);
    expect(parsed.negative).toHaveLength(0);
  });

  it("차단 태그 하나가 깨져도 나머지는 살아남는다", () => {
    // 한 번에 join해서 넘기면 손상된 항목 하나가 블랙리스트 전체를 날린다
    const parsed = parseSubscriptionQuery("artist:foo", [
      "!!!망가진태그",
      "female:netorare",
    ]);

    expect(parsed.negative).toHaveLength(1);
    expect(parsed.negative[0].name).toBe("netorare");
  });

  it("제목 단어는 무시한다 (구독은 태그만 본다)", () => {
    const parsed = parseSubscriptionQuery("artist:foo 제목단어", []);

    expect(parsed.positive).toHaveLength(1);
    expect(parsed.negative).toHaveLength(0);
  });
});
