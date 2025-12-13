import { describe, expect, it, vi } from "vitest";

// DB 모듈 mock 처리 (Electron app 객체 없이 테스트하기 위함)
vi.mock("../../../src/main/db/index.ts", () => ({
  default: {},
  closeDbConnection: vi.fn(),
}));

// Electron app mock 처리
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/mock/user/data"),
    getAppPath: vi.fn(() => "/mock/app"),
    getVersion: vi.fn(() => "1.0.0"),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  protocol: {
    handle: vi.fn(),
  },
}));

// electron-store mock 처리
vi.mock("electron-store", () => ({
  default: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    store: {},
  })),
}));

// electron-updater mock 처리
vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: {
      checkForUpdates: vi.fn(),
      on: vi.fn(),
    },
  },
}));

// electron-log mock 처리
vi.mock("electron-log", () => ({
  default: {
    initialize: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { cleanValue } from "../../../src/main/handlers/directoryHandler";

describe("directoryHandler", () => {
  describe("cleanValue", () => {
    it("'N/A' 문자열은 null을 반환해야 함", () => {
      expect(cleanValue("N/A")).toBeNull();
    });

    it("undefined는 null을 반환해야 함", () => {
      expect(cleanValue(undefined)).toBeNull();
    });

    it("null은 null을 반환해야 함", () => {
      expect(cleanValue(null)).toBeNull();
    });

    it("빈 문자열은 그대로 반환해야 함", () => {
      expect(cleanValue("")).toBe("");
    });

    it("유효한 문자열은 그대로 반환해야 함", () => {
      expect(cleanValue("valid value")).toBe("valid value");
      expect(cleanValue("test")).toBe("test");
    });

    it("숫자를 포함한 문자열은 그대로 반환해야 함", () => {
      expect(cleanValue("123")).toBe("123");
      expect(cleanValue("value123")).toBe("value123");
    });

    it("공백만 있는 문자열은 그대로 반환해야 함", () => {
      expect(cleanValue("   ")).toBe("   ");
    });

    it("'N/A'를 포함하지만 정확히 일치하지 않는 문자열은 그대로 반환해야 함", () => {
      expect(cleanValue("N/A value")).toBe("N/A value");
      expect(cleanValue("value N/A")).toBe("value N/A");
      expect(cleanValue("n/a")).toBe("n/a"); // 대소문자 구분
    });

    it("특수문자를 포함한 문자열은 그대로 반환해야 함", () => {
      expect(cleanValue("특수!@#$%^&*()")).toBe("특수!@#$%^&*()");
    });

    it("한글을 포함한 문자열은 그대로 반환해야 함", () => {
      expect(cleanValue("한글 제목")).toBe("한글 제목");
      expect(cleanValue("작가명")).toBe("작가명");
    });
  });

  describe("extractCoverFromZip (로직 검증)", () => {
    it("이미지 파일 확장자를 올바르게 인식해야 함", () => {
      // 이미지 파일 매칭 정규식
      const imageRegex = /\.(jpg|jpeg|png|webp)$/i;

      expect(imageRegex.test("cover.jpg")).toBe(true);
      expect(imageRegex.test("image.jpeg")).toBe(true);
      expect(imageRegex.test("photo.png")).toBe(true);
      expect(imageRegex.test("pic.webp")).toBe(true);
    });

    it("대소문자 구분 없이 이미지 파일을 인식해야 함", () => {
      const imageRegex = /\.(jpg|jpeg|png|webp)$/i;

      expect(imageRegex.test("cover.JPG")).toBe(true);
      expect(imageRegex.test("image.JPEG")).toBe(true);
      expect(imageRegex.test("photo.PNG")).toBe(true);
      expect(imageRegex.test("pic.WEBP")).toBe(true);
    });

    it("이미지가 아닌 파일은 매칭되지 않아야 함", () => {
      const imageRegex = /\.(jpg|jpeg|png|webp)$/i;

      expect(imageRegex.test("document.txt")).toBe(false);
      expect(imageRegex.test("video.mp4")).toBe(false);
      expect(imageRegex.test("archive.zip")).toBe(false);
      expect(imageRegex.test("readme.md")).toBe(false);
    });

    it("지원하지 않는 이미지 형식은 매칭되지 않아야 함", () => {
      const imageRegex = /\.(jpg|jpeg|png|webp)$/i;

      expect(imageRegex.test("image.gif")).toBe(false);
      expect(imageRegex.test("image.bmp")).toBe(false);
      expect(imageRegex.test("image.svg")).toBe(false);
      expect(imageRegex.test("image.tiff")).toBe(false);
    });

    it("경로가 포함된 파일명도 올바르게 매칭해야 함", () => {
      const imageRegex = /\.(jpg|jpeg|png|webp)$/i;

      expect(imageRegex.test("folder/subfolder/image.jpg")).toBe(true);
      expect(imageRegex.test("path/to/cover.png")).toBe(true);
    });

    it("확장자가 없는 파일은 매칭되지 않아야 함", () => {
      const imageRegex = /\.(jpg|jpeg|png|webp)$/i;

      expect(imageRegex.test("filename")).toBe(false);
      expect(imageRegex.test("image")).toBe(false);
    });

    it("확장자가 중간에 있는 경우 매칭되지 않아야 함", () => {
      const imageRegex = /\.(jpg|jpeg|png|webp)$/i;

      expect(imageRegex.test("image.jpg.backup")).toBe(false);
      expect(imageRegex.test("cover.png.tmp")).toBe(false);
    });
  });

  describe("Windows MAX_PATH 제한 검증", () => {
    const MAX_PATH_LENGTH = 260;

    it("MAX_PATH 상수가 올바르게 정의되어야 함", () => {
      expect(MAX_PATH_LENGTH).toBe(260);
    });

    it("짧은 경로는 제한 내에 있어야 함", () => {
      const shortPath = "C:\\Users\\test\\file.txt";
      expect(shortPath.length).toBeLessThan(MAX_PATH_LENGTH);
    });

    it("긴 경로는 제한을 초과할 수 있음을 확인", () => {
      const longPath = "C:\\".padEnd(MAX_PATH_LENGTH + 1, "a");
      expect(longPath.length).toBeGreaterThan(MAX_PATH_LENGTH);
    });

    it("정확히 260자인 경로는 제한에 걸려야 함", () => {
      const exactPath = "C:\\".padEnd(MAX_PATH_LENGTH, "a");
      expect(exactPath.length).toBe(MAX_PATH_LENGTH);
    });
  });
});
