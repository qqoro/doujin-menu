import { describe, expect, it } from "vitest";
import { tagSearchTerm, toTagParts } from "../../../src/renderer/lib/tagBadge";

describe("toTagParts", () => {
  it("DB 성별 태그는 접두어를 종류로 뗀다", () => {
    expect(toTagParts("female:solo_girl")).toEqual({
      kind: "female",
      name: "solo_girl",
    });
    expect(toTagParts("male:sole_male")).toEqual({
      kind: "male",
      name: "sole_male",
    });
  });

  it("DB 일반 태그는 접두어 없이 tag 종류다", () => {
    expect(toTagParts("full_color")).toEqual({
      kind: "tag",
      name: "full_color",
    });
  });

  // 라이브러리와 다운로더가 같은 태그를 같은 글자로 보여야 한다
  it("히토미 태그는 띄어쓰기를 밑줄로 바꾼다", () => {
    expect(toTagParts({ type: "female", name: "solo girl" })).toEqual({
      kind: "female",
      name: "solo_girl",
    });
    expect(toTagParts({ type: "tag", name: "full color" })).toEqual({
      kind: "tag",
      name: "full_color",
    });
  });

  it("차단 태그 항목의 tag: 접두어도 뗀다", () => {
    expect(toTagParts("tag:netorare")).toEqual({
      kind: "tag",
      name: "netorare",
    });
  });

  it("태그 종류가 아닌 접두어는 이름에 남긴다", () => {
    expect(toTagParts("artist:someone")).toEqual({
      kind: "tag",
      name: "artist:someone",
    });
  });
});

describe("tagSearchTerm", () => {
  it("성별 태그는 저장된 형태 그대로다", () => {
    expect(tagSearchTerm("female:solo_girl")).toBe("female:solo_girl");
  });

  // 접두어 없는 단어는 제목 검색으로 들어간다
  it("일반 태그는 tag:를 붙인다", () => {
    expect(tagSearchTerm("full_color")).toBe("tag:full_color");
  });

  it("히토미 태그도 같은 검색어가 된다", () => {
    expect(tagSearchTerm({ type: "female", name: "solo girl" })).toBe(
      "female:solo_girl",
    );
    expect(tagSearchTerm({ type: "tag", name: "full color" })).toBe(
      "tag:full_color",
    );
  });
});
