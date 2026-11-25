import type { Gallery } from "node-hitomi";
import { describe, expect, it } from "vitest";
import { toGalleryDto } from "../../../src/main/services/hitomi/gallery.js";

const fakeGallery = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 100,
    title: { display: "제목" },
    type: "doujinshi",
    language: { name: "korean", localName: "한국어" },
    artists: [],
    groups: [],
    series: [],
    characters: [],
    tags: [],
    files: [{ resolveUrl: async () => "//t.example/a.webp" }],
    publishedDate: null,
    addedDate: new Date("2026-01-01"),
    translations: [],
    relations: [],
    ...overrides,
  }) as unknown as Gallery;

describe("toGalleryDto — 언어판과 연관 작품", () => {
  it("언어판을 id와 언어 이름으로 옮기고 언어가 없으면 null로 둔다", async () => {
    const dto = await toGalleryDto(
      fakeGallery({
        translations: [
          { id: 1, language: { name: "japanese", localName: "日本語" } },
          { id: 2, language: null },
        ],
      }),
    );

    expect(dto.translations).toEqual([
      { id: 1, languageName: { english: "japanese", local: "日本語" } },
      { id: 2, languageName: null },
    ]);
  });

  it("연관 작품은 id만 순서대로 담는다", async () => {
    const dto = await toGalleryDto(
      fakeGallery({ relations: [{ id: 7 }, { id: 8 }] }),
    );

    expect(dto.relatedIds).toEqual([7, 8]);
    expect(dto.thumbnailUrl).toBe("https://t.example/a.webp");
  });
});
