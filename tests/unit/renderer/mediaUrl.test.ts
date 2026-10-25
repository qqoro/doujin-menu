import { describe, expect, it } from "vitest";
import { toMediaUrl } from "@/lib/mediaUrl";

describe("toMediaUrl", () => {
  it("Electron에서는 그대로 둔다", () => {
    expect(toMediaUrl("file://C:\\x.webp", false)).toBe("file://C:\\x.webp");
  });

  it("빈 문자열은 빈 문자열", () => {
    expect(toMediaUrl("", true)).toBe("");
  });

  it("뷰어 페이지 프로토콜을 HTTP 경로로 바꾼다", () => {
    expect(toMediaUrl("doujin-menu://12/3", true)).toBe("/media/page/12/3");
  });

  it("윈도우 경로 그대로의 file URL은 쿼리를 살려 바꾼다", () => {
    expect(toMediaUrl("file://C:\\lib\\thumbnails\\1.webp?v=5", true)).toBe(
      "/media/file?path=C%3A%5Clib%5Cthumbnails%5C1.webp&v=5",
    );
  });

  it("표준 file:/// URL은 퍼센트 인코딩을 풀고 다시 인코딩한다", () => {
    expect(toMediaUrl("file:///C:/a%20b/2.webp", true)).toBe(
      "/media/file?path=C%3A%2Fa%20b%2F2.webp",
    );
  });

  it("경로 속 #은 조각으로 보지 않는다", () => {
    expect(toMediaUrl("file://C:\\a#b.webp", true)).toBe(
      "/media/file?path=C%3A%5Ca%23b.webp",
    );
  });

  it("다른 URL은 그대로 둔다", () => {
    expect(toMediaUrl("https://x.test/a.webp", true)).toBe(
      "https://x.test/a.webp",
    );
    expect(toMediaUrl("data:image/png;base64,AA", true)).toBe(
      "data:image/png;base64,AA",
    );
  });
});
