import { describe, expect, it } from "vitest";
import {
  formatInfoContent,
  toInfoFields,
} from "../../../src/main/parsers/infoTxtFormat.js";
import { parseInfoTxt } from "../../../src/main/parsers/infoTxtParser.js";
import type { BookInfoFields } from "../../../src/types/ipc.js";

const sample: BookInfoFields = {
  hitomi_id: "2841735",
  title: "Megane no Kanojo | 안경 쓴 그녀",
  artists: ["mizuryu_kei"],
  groups: [],
  type: "manga",
  series: ["original"],
  characters: [],
  tags: ["female:glasses", "full_color"],
  language: "korean",
};

describe("formatInfoContent", () => {
  it("파서가 다시 읽으면 같은 항목이 나온다", () => {
    expect(toInfoFields(parseInfoTxt(formatInfoContent(sample)))).toEqual(
      sample,
    );
  });

  it("빈 항목은 N/A로 쓰고 다시 읽으면 빈 값이 된다", () => {
    const content = formatInfoContent({
      ...sample,
      hitomi_id: null,
      groups: [],
      type: null,
      language: null,
    });
    expect(content).toContain("갤러리 넘버: N/A");
    expect(content).toContain("그룹: N/A");

    const fields = toInfoFields(parseInfoTxt(content));
    expect(fields.hitomi_id).toBeNull();
    expect(fields.groups).toEqual([]);
    expect(fields.type).toBeNull();
    expect(fields.language).toBeNull();
  });

  it("제목의 줄바꿈은 다음 항목을 깨뜨리지 않게 공백으로 바꾼다", () => {
    const content = formatInfoContent({
      ...sample,
      title: "첫 줄\n작가: 가짜",
    });
    const fields = toInfoFields(parseInfoTxt(content));
    expect(fields.title).toBe("첫 줄 작가: 가짜");
    expect(fields.artists).toEqual(["mizuryu_kei"]);
  });
});
