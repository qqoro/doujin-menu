import { describe, expect, it } from "vitest";
import { formatDownloadFolderName } from "../../../src/main/utils/index.js";
import type { Gallery } from "node-hitomi";

describe("formatDownloadFolderName", () => {
  // 기본 갤러리 템플릿
  const createGallery = (overrides: Partial<Gallery> = {}): Gallery =>
    ({
      id: 123,
      title: { display: "Test Title" },
      ...overrides,
    }) as Gallery;

  describe("기본 변수 치환", () => {
    it("artist가 있으면 artist 사용", () => {
      const gallery = createGallery({ artists: ["ArtistA"] });
      expect(formatDownloadFolderName(gallery, "%artist% - %title%")).toBe(
        "ArtistA - Test Title",
      );
    });

    it("artist가 없으면 N/A 사용", () => {
      const gallery = createGallery();
      // N/A의 /는 전자 문자로 변환됨
      expect(formatDownloadFolderName(gallery, "%artist% - %title%")).toBe(
        "N／A - Test Title",
      );
    });

    it("groups가 있으면 groups 사용", () => {
      const gallery = createGallery({ groups: ["GroupA", "GroupB"] });
      expect(formatDownloadFolderName(gallery, "%groups% - %title%")).toBe(
        "GroupA, GroupB - Test Title",
      );
    });

    it("id 치환", () => {
      const gallery = createGallery();
      expect(formatDownloadFolderName(gallery, "%id% - %title%")).toBe(
        "123 - Test Title",
      );
    });

    it("language 치환", () => {
      const gallery = createGallery({
        languageName: { english: "Korean", local: null },
      });
      expect(formatDownloadFolderName(gallery, "%language% - %title%")).toBe(
        "Korean - Test Title",
      );
    });

    it("series 치환", () => {
      const gallery = createGallery({ series: ["SeriesA"] });
      expect(formatDownloadFolderName(gallery, "%series% - %title%")).toBe(
        "SeriesA - Test Title",
      );
    });

    it("character 치환", () => {
      const gallery = createGallery({ characters: ["CharacterA"] });
      expect(formatDownloadFolderName(gallery, "%character% - %title%")).toBe(
        "CharacterA - Test Title",
      );
    });

    it("type 치환", () => {
      const gallery = createGallery({ type: "manga" });
      expect(formatDownloadFolderName(gallery, "%type% - %title%")).toBe(
        "manga - Test Title",
      );
    });
  });

  describe("Fallback 문법", () => {
    it("artist가 있으면 artist 사용 (fallback 없음)", () => {
      const gallery = createGallery({ artists: ["ArtistA"] });
      expect(
        formatDownloadFolderName(gallery, "%artist|groups% - %title%"),
      ).toBe("ArtistA - Test Title");
    });

    it("artist가 없으면 groups 사용", () => {
      const gallery = createGallery({ groups: ["GroupA"] });
      expect(
        formatDownloadFolderName(gallery, "%artist|groups% - %title%"),
      ).toBe("GroupA - Test Title");
    });

    it("artist와 groups 둘 다 없으면 N/A", () => {
      const gallery = createGallery();
      // N/A의 /는 전자 문자로 변환됨
      expect(
        formatDownloadFolderName(gallery, "%artist|groups% - %title%"),
      ).toBe("N／A - Test Title");
    });

    it("3단계 fallback: artist → groups → series", () => {
      const gallery = createGallery({ series: ["SeriesA"] });
      expect(
        formatDownloadFolderName(gallery, "%artist|groups|series% - %title%"),
      ).toBe("SeriesA - Test Title");
    });

    it("우선순위 변경: groups가 artist보다 우선", () => {
      const gallery = createGallery({
        artists: ["ArtistA"],
        groups: ["GroupA"],
      });
      expect(
        formatDownloadFolderName(gallery, "%groups|artist% - %title%"),
      ).toBe("GroupA - Test Title");
    });

    it("여러 fallback 패턴 동시 사용", () => {
      const gallery = createGallery({
        groups: ["GroupA"],
        series: ["SeriesA"],
      });
      expect(
        formatDownloadFolderName(
          gallery,
          "%artist|groups% - %character|series% - %title%",
        ),
      ).toBe("GroupA - SeriesA - Test Title");
    });
  });

  describe("Windows 호환성", () => {
    it("파이프(|) 문자를 전자 문자로 변환", () => {
      const gallery = createGallery({ artists: ["Artist|A"] });
      expect(formatDownloadFolderName(gallery, "%artist%")).toBe("Artist｜A");
    });

    it("슬래시(/) 문자를 전자 문자로 변환", () => {
      const gallery = createGallery({ artists: ["Artist/A"] });
      expect(formatDownloadFolderName(gallery, "%artist%")).toBe("Artist／A");
    });

    it("Windows 예약 문자 제거", () => {
      const gallery = createGallery({ artists: ['Artist<>"\\:*?A'] });
      expect(formatDownloadFolderName(gallery, "%artist%")).toBe("ArtistA");
    });

    it("여러 공백을 하나로 축소", () => {
      const gallery = createGallery({ artists: ["Artist   A"] });
      expect(formatDownloadFolderName(gallery, "%artist%")).toBe("Artist A");
    });

    it("앞뒤 공백 제거", () => {
      const gallery = createGallery({ artists: ["  Artist A  "] });
      expect(formatDownloadFolderName(gallery, "%artist%")).toBe("Artist A");
    });
  });
});
