import { describe, expect, it } from "vitest";
import {
  BOOK_ASPECT,
  GALLERY_ASPECT,
  listRowEstimate,
  listThumbnailSize,
} from "../../../src/renderer/lib/cardLayout";

describe("listThumbnailSize", () => {
  it("기본 줌에서 128px, 3:4 비율", () => {
    expect(listThumbnailSize(1)).toEqual({ width: 128, height: 171 });
  });

  // uiStore의 줌 범위가 0.4~1.5입니다
  it("최소·최대 줌 경계", () => {
    expect(listThumbnailSize(0.4)).toEqual({ width: 51, height: 68 });
    expect(listThumbnailSize(1.5)).toEqual({ width: 192, height: 256 });
  });

  // localStorage가 비었거나 오염되면 0이나 NaN이 들어옵니다
  it("줌 값이 망가져 있으면 1로 취급한다", () => {
    expect(listThumbnailSize(0)).toEqual(listThumbnailSize(1));
    expect(listThumbnailSize(Number.NaN)).toEqual(listThumbnailSize(1));
    expect(listThumbnailSize(-2)).toEqual(listThumbnailSize(1));
  });

  // 라이브러리 표지는 2:3이라 같은 폭에서 갤러리보다 세로로 깁니다
  it("비율 인자에 따라 높이만 달라진다", () => {
    const gallery = listThumbnailSize(1, GALLERY_ASPECT);
    const book = listThumbnailSize(1, BOOK_ASPECT);
    expect(book.width).toBe(gallery.width);
    expect(book.height).toBe(192);
    expect(book.height).toBeGreaterThan(gallery.height);
  });

  it("비율을 안 주면 갤러리 비율을 쓴다", () => {
    expect(listThumbnailSize(1)).toEqual(listThumbnailSize(1, GALLERY_ASPECT));
  });
});

describe("listRowEstimate", () => {
  // 초기 추정이 줌을 안 따라가면 최소 줌에서 총 높이가 세 배 넘게 어긋나
  // 스크롤바 길이와 실제 내용이 따로 놉니다
  it("줌이 커지면 추정 높이도 커진다", () => {
    expect(listRowEstimate(1.5)).toBeGreaterThan(listRowEstimate(1));
    expect(listRowEstimate(1)).toBeGreaterThan(listRowEstimate(0.4));
  });

  // 썸네일을 아무리 줄여도 제목·메타·크레딧·태그가 차지하는 바닥이 있습니다
  it("썸네일이 작아져도 본문 최소 높이 아래로는 안 내려간다", () => {
    expect(listRowEstimate(0.4)).toBeGreaterThanOrEqual(150);
  });

  it("기본 줌에서 썸네일 높이보다 크다", () => {
    expect(listRowEstimate(1)).toBeGreaterThan(listThumbnailSize(1).height);
  });

  it("세로로 긴 비율이면 추정 높이도 커진다", () => {
    expect(listRowEstimate(1, BOOK_ASPECT)).toBeGreaterThan(
      listRowEstimate(1, GALLERY_ASPECT),
    );
  });
});
