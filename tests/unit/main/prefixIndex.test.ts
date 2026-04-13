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
  it("rebuild 후 addBook으로 기존 그룹에 책을 추가할 수 있어야 합니다", () => {
    const index = new PrefixIndex();
    const books = [
      createMockBook(1, "테스트 시리즈 1"),
      createMockBook(2, "테스트 시리즈 2"),
      createMockBook(3, "다른 시리즈 1"),
    ];

    index.rebuild(books, []);

    // 같은 시리즈에 새 책 추가
    const result = index.addBook(createMockBook(4, "테스트 시리즈 3"));
    expect(result.existingBookIds.length).toBeGreaterThan(0);
  });

  it("시리즈 연결이 올바르게 동작해야 합니다", () => {
    const index = new PrefixIndex();
    const books = [
      createMockBook(1, "시리즈 1"),
      createMockBook(2, "시리즈 2"),
    ];

    index.rebuild(books, [{ id: 10, name: "시리즈", bookIds: [1, 2] }]);

    // addBook 시 seriesId 반환 확인
    const result = index.addBook(createMockBook(3, "시리즈 3"));
    expect(result.seriesId).toBe(10);
  });

  it("addBook이 새 책을 인덱스에 추가해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild([createMockBook(1, "시리즈 1")], []);

    // 같은 시리즈의 새 책 추가
    const newBook = createMockBook(2, "시리즈 2");
    const result = index.addBook(newBook);

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

    // 제거 후 addBook으로 확인 (book 1이 더 이상 매칭되지 않아야 함)
    const result = index.addBook(createMockBook(3, "시리즈 3"));
    expect(result.existingBookIds).toEqual([2]);
  });

  it("매칭 없는 책은 새 엔트리를 생성해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild([createMockBook(1, "완전히 다른 시리즈 1")], []);

    const result = index.addBook(createMockBook(2, "전혀 다른 것"));
    expect(result.existingBookIds).toEqual([]);
    expect(result.seriesId).toBeNull();
  });

  it("size가 올바른 그룹 수를 반환해야 합니다", () => {
    const index = new PrefixIndex();
    index.rebuild(
      [createMockBook(1, "시리즈 A 1"), createMockBook(2, "시리즈 B 1")],
      [],
    );

    // 비교 기반에서 "시리즈 A 1"과 "시리즈 B 1"은 다른 그룹
    expect(index.size).toBe(2);
  });
});
