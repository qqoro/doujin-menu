import { describe, expect, it } from "vitest";
import {
  isValidGalleryId,
  joinNameList,
  parseNameList,
  removeNameAt,
  replaceToken,
  suggestNames,
  tokenAt,
} from "@/lib/nameList";

describe("parseNameList", () => {
  it("띄어쓰기로 나누고 빈 칸과 중복은 뺀다", () => {
    expect(parseNameList("  a   b a\tc ")).toEqual(["a", "b", "c"]);
  });

  it("태그 칸은 tag: 접두어를 떼고 female:은 남긴다", () => {
    expect(
      parseNameList("tag:full_color female:glasses full_color", { tag: true }),
    ).toEqual(["full_color", "female:glasses"]);
  });

  it("다른 칸은 tag:를 이름으로 둔다", () => {
    expect(parseNameList("tag:x")).toEqual(["tag:x"]);
  });
});

describe("tokenAt / replaceToken", () => {
  it("커서가 놓인 단어를 찾는다", () => {
    const text = "female:glasses ful story_arc";
    expect(tokenAt(text, 18)).toEqual({ start: 15, end: 18, query: "ful" });
    expect(tokenAt(text, 16).query).toBe("ful");
  });

  it("공백 위의 커서는 빈 단어다", () => {
    expect(tokenAt("a  b", 2).query).toBe("");
  });

  it("끝 단어를 바꾸면 공백을 붙이고 커서를 그 뒤로 둔다", () => {
    const text = "female:glasses ful";
    const result = replaceToken(text, tokenAt(text, text.length), "full_color");
    expect(result).toEqual({
      text: "female:glasses full_color ",
      caret: "female:glasses full_color ".length,
    });
  });

  it("중간 단어를 바꾸면 뒤쪽은 그대로다", () => {
    const text = "aa ful bb";
    const result = replaceToken(text, tokenAt(text, 5), "full_color");
    expect(result.text).toBe("aa full_color bb");
    expect(result.caret).toBe("aa full_color ".length);
  });
});

describe("removeNameAt", () => {
  it("뱃지 순서대로 지우고 공백을 정리한다", () => {
    expect(removeNameAt("a  b c", 1)).toBe("a c");
  });

  it("태그 칸은 접두어를 뗀 결과로 다시 쓴다", () => {
    expect(removeNameAt("tag:a b", 1, { tag: true })).toBe("a");
  });
});

describe("suggestNames", () => {
  const pool = [
    "full_censorship",
    "female:glasses",
    "full_color",
    "colorful",
    "female:big_breasts",
  ];

  it("앞부분이 맞는 이름을 먼저 준다", () => {
    expect(suggestNames(pool, "ful", [])).toEqual([
      "full_censorship",
      "full_color",
      "colorful",
    ]);
  });

  it("접두어를 빼고도 찾는다", () => {
    expect(suggestNames(pool, "gla", [])).toEqual(["female:glasses"]);
  });

  it("이미 넣은 이름과 친 그대로인 이름은 뺀다", () => {
    expect(suggestNames(pool, "full_color", [])).toEqual([]);
    expect(suggestNames(pool, "ful", ["full_color"])).not.toContain(
      "full_color",
    );
  });

  it("빈 단어에는 후보가 없다", () => {
    expect(suggestNames(pool, "", [])).toEqual([]);
  });
});

describe("isValidGalleryId", () => {
  it("비우거나 숫자만 허용한다", () => {
    expect(isValidGalleryId("")).toBe(true);
    expect(isValidGalleryId(" 123 ")).toBe(true);
    expect(isValidGalleryId("12a")).toBe(false);
  });
});

describe("joinNameList", () => {
  it("띄어쓰기로 잇는다", () => {
    expect(joinNameList(["a", "b"])).toBe("a b");
  });
});
