import { describe, expect, it } from "vitest";
import {
  imageMimeType,
  isImageFile,
  sortImageFiles,
} from "../../../src/main/utils/imageFiles.js";

describe("isImageFile", () => {
  it("지원 확장자를 대소문자 구분 없이 인식한다", () => {
    expect(isImageFile("a.jpg")).toBe(true);
    expect(isImageFile("a.JPEG")).toBe(true);
    expect(isImageFile("a.WebP")).toBe(true);
    expect(isImageFile("a.gif")).toBe(true);
    expect(isImageFile("a.bmp")).toBe(true);
  });

  it("이미지가 아닌 파일은 거른다", () => {
    expect(isImageFile("info.txt")).toBe(false);
    expect(isImageFile("a.zip")).toBe(false);
    expect(isImageFile("noext")).toBe(false);
  });
});

describe("sortImageFiles", () => {
  it("사전순이 아니라 자연 정렬로 세운다", () => {
    expect(
      sortImageFiles(["img_10.jpg", "img_9.jpg", "img_1.jpg"]),
    ).toStrictEqual(["img_1.jpg", "img_9.jpg", "img_10.jpg"]);
  });

  it("이미지가 아닌 항목을 뺀다", () => {
    expect(
      sortImageFiles(["info.txt", "2.png", "Thumbs.db", "1.png"]),
    ).toStrictEqual(["1.png", "2.png"]);
  });

  it("gif/bmp도 페이지로 인정한다", () => {
    expect(sortImageFiles(["2.bmp", "1.gif"])).toStrictEqual([
      "1.gif",
      "2.bmp",
    ]);
  });
});

describe("imageMimeType", () => {
  it("jpg를 image/jpeg로 돌려준다", () => {
    expect(imageMimeType("a.jpg")).toBe("image/jpeg");
    expect(imageMimeType("a.JPG")).toBe("image/jpeg");
    expect(imageMimeType("a.jpeg")).toBe("image/jpeg");
  });

  it("나머지 확장자를 매핑한다", () => {
    expect(imageMimeType("a.png")).toBe("image/png");
    expect(imageMimeType("a.webp")).toBe("image/webp");
    expect(imageMimeType("a.gif")).toBe("image/gif");
    expect(imageMimeType("a.bmp")).toBe("image/bmp");
  });

  it("모르는 확장자는 octet-stream", () => {
    expect(imageMimeType("a.xyz")).toBe("application/octet-stream");
  });
});
