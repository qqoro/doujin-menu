import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildGalleryDownloadPath,
  formatDownloadFolderName,
} from "../../../src/main/utils/index.js";
import type { Gallery } from "node-hitomi";

// 기본 갤러리 템플릿
const createGallery = (overrides: Partial<Gallery> = {}): Gallery =>
  ({
    id: 123,
    title: { display: "Test Title" },
    ...overrides,
  }) as Gallery;

describe("formatDownloadFolderName", () => {
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

  describe("중첩 폴더 (경로 구분자)", () => {
    it("패턴의 백슬래시로 하위 폴더 생성", () => {
      const gallery = createGallery({
        artists: ["ArtistA"],
        groups: ["GroupA"],
      });
      expect(
        formatDownloadFolderName(gallery, "%groups%\\[%artist%] %title%"),
      ).toBe(path.join("GroupA", "[ArtistA] Test Title"));
    });

    it("패턴의 슬래시로 하위 폴더 생성", () => {
      const gallery = createGallery({
        artists: ["ArtistA"],
        groups: ["GroupA"],
      });
      expect(
        formatDownloadFolderName(gallery, "%groups%/[%artist%] %title%"),
      ).toBe(path.join("GroupA", "[ArtistA] Test Title"));
    });

    it("변수 값에 든 슬래시는 폴더로 새지 않고 전자 문자로 변환", () => {
      const gallery = createGallery({
        artists: ["Artist/A"],
        groups: ["GroupA"],
      });
      expect(formatDownloadFolderName(gallery, "%groups%\\%artist%")).toBe(
        path.join("GroupA", "Artist／A"),
      );
    });

    it("연속 구분자는 빈 세그먼트를 만들지 않음", () => {
      const gallery = createGallery({
        artists: ["ArtistA"],
        groups: ["GroupA"],
      });
      expect(formatDownloadFolderName(gallery, "%groups%\\\\%artist%")).toBe(
        path.join("GroupA", "ArtistA"),
      );
    });

    it("선행 구분자는 빈 세그먼트를 만들지 않음", () => {
      const gallery = createGallery({ artists: ["ArtistA"] });
      expect(formatDownloadFolderName(gallery, "\\%artist%")).toBe("ArtistA");
    });

    it("상위 경로(..) 세그먼트는 제거되어 경로 탈출을 막음", () => {
      const gallery = createGallery({ artists: ["ArtistA"] });
      expect(formatDownloadFolderName(gallery, "..\\%artist%")).toBe("ArtistA");
    });

    it("현재 경로(.) 세그먼트는 제거", () => {
      const gallery = createGallery({ artists: ["ArtistA"] });
      expect(formatDownloadFolderName(gallery, ".\\%artist%")).toBe("ArtistA");
    });

    it("Windows 예약 장치명 세그먼트에 replacement 부착", () => {
      const gallery = createGallery({ artists: ["ArtistA"], groups: ["NUL"] });
      expect(formatDownloadFolderName(gallery, "%groups%\\%artist%")).toBe(
        path.join("NUL_", "ArtistA"),
      );
    });

    it("끝 마침표 세그먼트에서 마침표 제거", () => {
      const gallery = createGallery({
        artists: ["ArtistA"],
        groups: ["Studio."],
      });
      expect(formatDownloadFolderName(gallery, "%groups%\\%artist%")).toBe(
        path.join("Studio", "ArtistA"),
      );
    });

    it("모든 세그먼트가 버려지면 갤러리 ID로 폴백", () => {
      const gallery = createGallery();
      expect(formatDownloadFolderName(gallery, "\\\\")).toBe("123");
    });
  });

  describe("capitalizeNames 옵션", () => {
    it("영문 작가명의 각 단어 첫 글자를 대문자로 변환", () => {
      const gallery = createGallery({ artists: ["hitomi zoa"] });
      expect(
        formatDownloadFolderName(gallery, "%artist%", {
          capitalizeNames: true,
        }),
      ).toBe("Hitomi Zoa");
    });

    it("약어의 기존 대문자를 보존", () => {
      const gallery = createGallery({ artists: ["SDF"] });
      expect(
        formatDownloadFolderName(gallery, "%artist%", {
          capitalizeNames: true,
        }),
      ).toBe("SDF");
    });

    it("그룹명에도 적용", () => {
      const gallery = createGallery({ groups: ["some group"] });
      expect(
        formatDownloadFolderName(gallery, "%groups%", {
          capitalizeNames: true,
        }),
      ).toBe("Some Group");
    });

    it("제목에는 적용하지 않음", () => {
      const gallery = createGallery({
        title: { display: "test title" } as Gallery["title"],
      });
      expect(
        formatDownloadFolderName(gallery, "%title%", { capitalizeNames: true }),
      ).toBe("test title");
    });

    it("한글은 영향 없음", () => {
      const gallery = createGallery({ artists: ["작가 이름"] });
      expect(
        formatDownloadFolderName(gallery, "%artist%", {
          capitalizeNames: true,
        }),
      ).toBe("작가 이름");
    });

    it("옵션이 꺼져 있으면 원문 유지", () => {
      const gallery = createGallery({ artists: ["hitomi zoa"] });
      expect(formatDownloadFolderName(gallery, "%artist%")).toBe("hitomi zoa");
    });
  });
});

describe("buildGalleryDownloadPath", () => {
  it("예산 내에서는 그대로 결합", () => {
    const gallery = createGallery({ artists: ["ArtistA"], groups: ["GroupA"] });
    expect(
      buildGalleryDownloadPath("C:\\dl", gallery, "%groups%\\%artist%"),
    ).toBe(path.join("C:\\dl", "GroupA", "ArtistA"));
  });

  it("capitalizeNames 옵션을 전달", () => {
    const gallery = createGallery({ artists: ["hitomi zoa"] });
    expect(
      buildGalleryDownloadPath("C:\\dl", gallery, "%artist%", {
        capitalizeNames: true,
      }),
    ).toBe(path.join("C:\\dl", "Hitomi Zoa"));
  });

  it("전체 경로 예산 초과 시 마지막 세그먼트만 자르고 부모 경로는 보존", () => {
    const gallery = createGallery({
      groups: ["GroupA"],
      title: { display: "A".repeat(300) } as Gallery["title"],
    });
    const result = buildGalleryDownloadPath(
      "C:\\dl",
      gallery,
      "%groups%\\%title%",
    );

    expect(result.length).toBeLessThanOrEqual(245);
    expect(result.startsWith(path.join("C:\\dl", "GroupA"))).toBe(true);
    expect(result.endsWith("... (123)")).toBe(true);
  });

  it("부모 경로만으로 예산 초과 시 갤러리 ID로 폴백", () => {
    const gallery = createGallery({
      groups: ["G".repeat(300)],
      artists: ["ArtistA"],
    });
    expect(
      buildGalleryDownloadPath("C:\\dl", gallery, "%groups%\\%artist%"),
    ).toBe(path.join("C:\\dl", "123"));
  });
});
