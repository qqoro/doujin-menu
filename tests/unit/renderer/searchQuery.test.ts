import { describe, expect, it } from "vitest";
import { toggleSearchTerm } from "../../../src/renderer/lib/searchQuery";

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
