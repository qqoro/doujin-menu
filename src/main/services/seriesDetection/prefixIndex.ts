/**
 * 접두사 인덱스
 * 시리즈 감지 성능 향상을 위해 책 제목의 파싱된 접두사를 인덱싱
 * O(1) 접두사 조회로 증분 감지 지원
 */

import type { Book } from "../../db/types.js";
import { parseTitlePattern } from "./titlePatternMatcher.js";

interface PrefixEntry {
  bookIds: Set<number>;
  seriesId: number | null;
}

/**
 * 접두사 기반 인덱스
 * 책 제목에서 파싱된 접두사를 키로 하여 O(1) 조회를 지원합니다.
 * 앱 시작 시 1회 구축하고, 세션 내에서 증분 업데이트합니다.
 */
export class PrefixIndex {
  // 소문자 접두사 → { bookIds, seriesId }
  private index = new Map<string, PrefixEntry>();

  /**
   * 전체 인덱스를 재구축합니다.
   * 앱 시작 시 또는 전체 재감지 후 호출합니다.
   */
  rebuild(
    books: Book[],
    seriesCollections: Array<{ id: number; name: string; bookIds?: number[] }>,
  ): void {
    this.index.clear();

    // 책들의 접두사 인덱싱
    for (const book of books) {
      const parseResult = parseTitlePattern(book.title);
      if (!parseResult.prefix) continue;

      const key = parseResult.prefix.toLowerCase();
      if (!this.index.has(key)) {
        this.index.set(key, { bookIds: new Set(), seriesId: null });
      }
      this.index.get(key)!.bookIds.add(book.id);
    }

    // 기존 시리즈와 연결
    for (const series of seriesCollections) {
      const key = series.name.toLowerCase();
      if (this.index.has(key)) {
        this.index.get(key)!.seriesId = series.id;
      } else {
        // 시리즈는 있지만 아직 인덱스에 없는 경우 (빈 시리즈 등)
        this.index.set(key, {
          bookIds: new Set(series.bookIds || []),
          seriesId: series.id,
        });
      }
    }
  }

  /**
   * 접두사로 기존 책/시리즈를 조회합니다. O(1).
   */
  lookup(
    prefix: string,
  ): { bookIds: number[]; seriesId: number | null } | null {
    const entry = this.index.get(prefix.toLowerCase());
    if (!entry) return null;
    return {
      bookIds: Array.from(entry.bookIds),
      seriesId: entry.seriesId,
    };
  }

  /**
   * 새 책을 인덱스에 추가하고 매칭 결과를 반환합니다.
   */
  addBook(book: Book): {
    prefix: string;
    existingBookIds: number[];
    seriesId: number | null;
  } {
    const parseResult = parseTitlePattern(book.title);
    const prefix = parseResult.prefix || book.title;
    const key = prefix.toLowerCase();

    if (!this.index.has(key)) {
      this.index.set(key, { bookIds: new Set(), seriesId: null });
    }

    const entry = this.index.get(key)!;
    entry.bookIds.add(book.id);

    return {
      prefix,
      existingBookIds: Array.from(entry.bookIds).filter((id) => id !== book.id),
      seriesId: entry.seriesId,
    };
  }

  /**
   * 접두사에 시리즈 ID를 연결합니다.
   */
  setSeriesForPrefix(prefix: string, seriesId: number): void {
    const key = prefix.toLowerCase();
    if (!this.index.has(key)) {
      this.index.set(key, { bookIds: new Set(), seriesId });
    } else {
      this.index.get(key)!.seriesId = seriesId;
    }
  }

  /**
   * 인덱스에서 책을 제거합니다.
   */
  removeBook(bookId: number): void {
    for (const entry of this.index.values()) {
      entry.bookIds.delete(bookId);
    }
  }

  /**
   * 인덱스에 등록된 접두사 수
   */
  get size(): number {
    return this.index.size;
  }
}
