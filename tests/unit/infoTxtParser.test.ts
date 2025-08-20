import { describe, expect, it } from "vitest";
import { parseInfoTxt } from "../../src/main/parsers/infoTxtParser";

describe("parseInfoTxt", () => {
  it("should parse basic info.txt content correctly", () => {
    const content = `
      갤러리 넘버: 12345
      제목: 테스트 제목
      작가: 작가1
      그룹: 그룹1
      타입: 만화
      시리즈: 시리즈1
      캐릭터: 캐릭터1
      태그: 태그1, 태그2
      언어: 한국어
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      hitomi_id: "12345",
      title: "테스트 제목",
      artists: [{ name: "작가1" }],
      groups: [{ name: "그룹1" }],
      type: "만화",
      series: [{ name: "시리즈1" }],
      characters: [{ name: "캐릭터1" }],
      tags: [{ name: "태그1" }, { name: "태그2" }],
      language: "한국어",
    });
  });

  it("should handle multiple artists, tags, series, and characters", () => {
    const content = `
      작가: 작가1, 작가2, 작가 3
      태그: 태그1, 태그 2, 태그3
      시리즈: 시리즈1, 시리즈2
      캐릭터: 캐릭터1, 캐릭터2
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      artists: [{ name: "작가1" }, { name: "작가2" }, { name: "작가_3" }],
      tags: [{ name: "태그1" }, { name: "태그_2" }, { name: "태그3" }],
      series: [{ name: "시리즈1" }, { name: "시리즈2" }],
      characters: [{ name: "캐릭터1" }, { name: "캐릭터2" }],
    });
  });

  it("should handle missing fields", () => {
    const content = `
      제목: 제목만 있음
      작가: 작가1
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      title: "제목만 있음",
      artists: [{ name: "작가1" }],
    });
  });

  it("should return an empty object for empty content", () => {
    const content = "";
    const result = parseInfoTxt(content);
    expect(result).toEqual({});
  });

  it("should handle extra whitespace around keys and values", () => {
    const content = `
      갤러리 넘버 :  12345  
      제목   :   테스트 제목   
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      hitomi_id: "12345",
      title: "테스트 제목",
    });
  });

  it("should handle values with colons", () => {
    const content = `
      제목: 제목: 콜론 포함
      작가: 작가:1
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      title: "제목: 콜론 포함",
      artists: [{ name: "작가:1" }],
    });
  });

  it("should replace spaces with underscores in artists, tags, series, characters", () => {
    const content = `
      작가: Space Artist
      태그: Space Tag
      시리즈: Space Series
      캐릭터: Space Character
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      artists: [{ name: "Space_Artist" }],
      tags: [{ name: "Space_Tag" }],
      series: [{ name: "Space_Series" }],
      characters: [{ name: "Space_Character" }],
    });
  });

  it("should handle multiple lines with the same key (last one wins)", () => {
    const content = `
      제목: 첫 번째 제목
      제목: 두 번째 제목
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      title: "두 번째 제목",
    });
  });

  it("should handle empty lines and lines with only whitespace", () => {
    const content = `
      제목: 제목
      
      작가: 작가
          
      태그: 태그
    `;
    const result = parseInfoTxt(content);
    expect(result).toEqual({
      title: "제목",
      artists: [{ name: "작가" }],
      tags: [{ name: "태그" }],
    });
  });
});
