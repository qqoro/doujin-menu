import { describe, expect, it } from "vitest";
import {
  findSpacedPrefixTerm,
  toggleSearchTerm,
} from "../../../src/renderer/lib/searchQuery";

describe("toggleSearchTerm", () => {
  it("빈 검색어에 항목 추가", () => {
    expect(toggleSearchTerm("", "artist:yanje")).toBe("artist:yanje");
  });

  it("기존 검색어 뒤에 항목 추가", () => {
    expect(toggleSearchTerm("tag:nurse", "artist:yanje")).toBe(
      "tag:nurse artist:yanje",
    );
  });

  it("이미 있는 항목은 제거 (토글)", () => {
    expect(toggleSearchTerm("tag:nurse artist:yanje", "artist:yanje")).toBe(
      "tag:nurse",
    );
  });

  it("가운데 항목을 제거해도 나머지 순서 유지", () => {
    expect(toggleSearchTerm("a b c", "b")).toBe("a c");
  });

  it("마지막 하나를 제거하면 빈 문자열", () => {
    expect(toggleSearchTerm("tag:nurse", "tag:nurse")).toBe("");
  });

  it("연속 공백은 정리된다", () => {
    expect(toggleSearchTerm("a    b", "c")).toBe("a b c");
  });

  it("앞뒤 공백이 있어도 정상 동작", () => {
    expect(toggleSearchTerm("  tag:nurse  ", "artist:yanje")).toBe(
      "tag:nurse artist:yanje",
    );
  });

  // 부분 일치로 지워지면 안 된다. tag:nurse가 있는 상태에서 tag:nurse2를
  // 토글하면 추가되어야지 tag:nurse가 사라지면 안 된다.
  it("접두사가 겹치는 다른 항목을 건드리지 않음", () => {
    expect(toggleSearchTerm("tag:nurse", "tag:nurse2")).toBe(
      "tag:nurse tag:nurse2",
    );
  });

  it("제외 항목과 포함 항목은 별개로 취급", () => {
    expect(toggleSearchTerm("tag:nurse", "-tag:nurse")).toBe(
      "tag:nurse -tag:nurse",
    );
  });

  it("같은 항목이 두 번 들어 있으면 하나만 제거", () => {
    expect(toggleSearchTerm("a b a", "a")).toBe("b a");
  });

  it("시리즈 항목 토글", () => {
    expect(toggleSearchTerm("", "series:arknights")).toBe("series:arknights");
    expect(toggleSearchTerm("series:arknights", "series:arknights")).toBe("");
  });

  it("캐릭터 항목 토글", () => {
    expect(toggleSearchTerm("", "character:asuna")).toBe("character:asuna");
    expect(toggleSearchTerm("character:asuna", "character:asuna")).toBe("");
  });
});

describe("findSpacedPrefixTerm", () => {
  it("공백 섞인 이름을 밑줄 키로 바꾼다", () => {
    expect(findSpacedPrefixTerm("artist:aa bb")).toEqual({
      start: 0,
      prefix: "artist:",
      key: "aa_bb",
    });
  });

  it("앞에 다른 항목이 있으면 시작 위치가 그 뒤", () => {
    expect(findSpacedPrefixTerm("tag:nurse artist:aa bb")).toEqual({
      start: 10,
      prefix: "artist:",
      key: "aa_bb",
    });
  });

  it("세 낱말 이상, 연속 공백, 대문자도 정리", () => {
    expect(findSpacedPrefixTerm("Series:Blue  Archive Plus")?.key).toBe(
      "blue_archive_plus",
    );
  });

  it("끝의 공백은 무시", () => {
    expect(findSpacedPrefixTerm("artist:aa bb ")?.key).toBe("aa_bb");
  });

  it("성별 태그 프리픽스도 인식", () => {
    expect(findSpacedPrefixTerm("female:big breasts")).toMatchObject({
      prefix: "female:",
      key: "big_breasts",
    });
  });

  it("공백이 없는 이름은 대상이 아님", () => {
    expect(findSpacedPrefixTerm("artist:aa_bb")).toBeNull();
    expect(findSpacedPrefixTerm("artist:aa_bb ")).toBeNull();
  });

  it("마지막 항목이 다른 프리픽스면 대상이 아님", () => {
    expect(findSpacedPrefixTerm("artist:aa tag:bb")).toBeNull();
    expect(findSpacedPrefixTerm("artist:aa -tag:bb")).toBeNull();
  });

  it("제외 항목과 id는 대상이 아님", () => {
    expect(findSpacedPrefixTerm("-artist:aa bb")).toBeNull();
    expect(findSpacedPrefixTerm("id:123 456")).toBeNull();
  });

  it("프리픽스 없는 낱말만 있으면 대상이 아님", () => {
    expect(findSpacedPrefixTerm("aa bb")).toBeNull();
  });
});
