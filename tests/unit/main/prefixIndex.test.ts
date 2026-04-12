import { describe, expect, it, vi } from "vitest";
import type { Book } from "../../../src/main/db/types";
import { PrefixIndex } from "../../../src/main/services/seriesDetection/prefixIndex";

// electron-log를 모의(mock) 처리
vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const createMockBook = (
  id: number,
  title: string,
  artists: string[] = [],
): Book => ({
  id,
  title,
  volume: null,
  path: `C:/books/book_${id}`,
  cover_path: null,
  page_count: 10,
  added_at: new Date().toISOString(),
  last_read_at: null,
  current_page: null,
  is_favorite: false,
  hitomi_id: null,
  artists: artists.map((name, i) => ({ id: 1000 + i, name })),
  tags: [],
  groups: [],
  characters: [],
  type: "folder",
  language_name_english: null,
  language_name_local: null,
  series_collection_id: null,
  series_order_index: null,
});

describe("prefixIndex/PrefixIndex", () => {
  it("rebuild 후 lookup이 올바르게 동작해야 합니다", () => {
    const index = new PrefixIndex();
    const books = [
      createMockBook(1, "테스트 시리즈 1"),
      createMockBook(2, "테스트 시리즈 2"),
      createMockBook(3, "다른 시리즈 1"),
    ];

    index.rebuild(books, []);

    // 접두사 "테스트 시리즈"로 조회
    const result = index.lookup("테스트 시리즈");
    expect(result).not.toBeNull();
    expect(result!.bookIds).toEqual([1, 2]);

    // 접두사 "다른 시리즈"로 조회
    const result2 = index.lookup("다른 시리즈");
    expect(result2).not.toBeNull();
    expect(result2!.bookIds).toEqual([3]);
  });

  it("시리즈 연결이 올바르게 동작해야 합니다", () => {
    const index = new PrefixIndex();
    const books = [
      createMockBook(1, "시리즈 1"),
      createMockBook(2, "시리즈 2"),
    ];

    index.rebuild(books, [{ id: 10, name: "시리즈", bookIds: [1, 2] }]);

    const result = index.lookup("시리즈");
    expect(result!.seriesId).toBe(10);
  });

  it("addBook이 새 책을 인덱스에 추가해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild([createMockBook(1, "시리즈 1")], []);

    // 새 책 추가
    const newBook = createMockBook(2, "시리즈 2");
    const result = index.addBook(newBook);

    expect(result.prefix).toBe("시리즈");
    expect(result.existingBookIds).toEqual([1]);
    expect(result.seriesId).toBeNull();
  });

  it("removeBook이 인덱스에서 책을 제거해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild(
      [createMockBook(1, "시리즈 1"), createMockBook(2, "시리즈 2")],
      [],
    );

    index.removeBook(1);

    const result = index.lookup("시리즈");
    expect(result!.bookIds).toEqual([2]);
  });

  it("대소문자 무시 조회가 동작해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild([createMockBook(1, "Test Series 1")], []);

    // 대소문자 무시
    const result = index.lookup("test series");
    expect(result).not.toBeNull();
    expect(result!.bookIds).toEqual([1]);
  });

  it("setSeriesForPrefix가 시리즈를 연결해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild([createMockBook(1, "시리즈 1")], []);

    index.setSeriesForPrefix("시리즈", 42);

    const result = index.lookup("시리즈");
    expect(result!.seriesId).toBe(42);
  });

  it("size가 올바른 접두사 수를 반환해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild(
      [createMockBook(1, "시리즈 A 1"), createMockBook(2, "시리즈 B 1")],
      [],
    );

    // 접두사는 "시리즈 A"와 "시리즈 B" 두 개
    expect(index.size).toBe(2);
  });
});
