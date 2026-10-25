import { describe, expect, it } from "vitest";
import { resolveAllowedMediaFile } from "../../../../src/main/web/mediaFiles.js";

const roots = ["C:\\data\\thumbnails"];
const onWindows = process.platform === "win32";

describe("resolveAllowedMediaFile", () => {
  it.runIf(onWindows)("허용 폴더 안의 파일은 그대로 돌려준다", () => {
    expect(resolveAllowedMediaFile("C:\\data\\thumbnails\\1.webp", roots)).toBe(
      "C:\\data\\thumbnails\\1.webp",
    );
  });

  it.runIf(onWindows)("대소문자가 달라도 같은 폴더로 본다", () => {
    expect(
      resolveAllowedMediaFile("c:\\DATA\\Thumbnails\\1.webp", roots),
    ).not.toBeNull();
  });

  it.runIf(onWindows)("..로 폴더 밖을 가리키면 거부한다", () => {
    expect(
      resolveAllowedMediaFile("C:\\data\\thumbnails\\..\\secret.txt", roots),
    ).toBeNull();
  });

  it.runIf(onWindows)(
    "이름이 같은 접두사로 시작하는 옆 폴더는 거부한다",
    () => {
      expect(
        resolveAllowedMediaFile("C:\\data\\thumbnails-evil\\1.webp", roots),
      ).toBeNull();
    },
  );

  it.runIf(onWindows)("다른 드라이브는 거부한다", () => {
    expect(
      resolveAllowedMediaFile("D:\\data\\thumbnails\\1.webp", roots),
    ).toBeNull();
  });

  it.runIf(onWindows)("UNC 경로는 거부한다", () => {
    expect(
      resolveAllowedMediaFile("\\\\server\\share\\1.webp", roots),
    ).toBeNull();
  });

  it.runIf(onWindows)("허용 폴더 자체는 거부한다", () => {
    expect(resolveAllowedMediaFile("C:\\data\\thumbnails", roots)).toBeNull();
  });
});
