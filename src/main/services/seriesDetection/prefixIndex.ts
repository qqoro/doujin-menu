/**
 * 비교 기반 인덱스
 * 시리즈 감지 성능 향상을 위해 비교 키를 인덱싱
 * O(n) 비교 사용 (증분 감지에서만 호출)
 */

import type { Book } from "../../db/types.js";
import {
  computeComparisonKey,
  type ComparisonKey,
  parseTitlePattern,
  shouldGroupTitles,
} from "./titlePatternMatcher.js";

interface IndexEntry {
  bookIds: Set<number>;
  seriesId: number | null;
  key: ComparisonKey;
}

/** 직렬화된 인덱스 엔트리 (postMessage 전송용) */
export interface SerializedIndexEntry {
  bookIds: number[];
  seriesId: number | null;
  key: ComparisonKey;
}

/**
 * 비교 기반 인덱스
 * 책 제목의 비교 키를 기반으로 인덱싱합니다.
 * 앱 시작 시 1회 구축하고, 세션 내에서 증분 업데이트합니다.
 */
export class PrefixIndex {
  private entries: IndexEntry[] = [];

  /**
   * 전체 인덱스를 재구축합니다.
   * 앱 시작 시 또는 전체 재감지 후 호출합니다.
   */
  rebuild(
    books: Book[],
    seriesCollections: Array<{ id: number; name: string; bookIds?: number[] }>,
  ): void {
    this.entries = [];

    // 책들을 비교 키 기반으로 그룹화
    for (const book of books) {
      const key = computeComparisonKey(book.title);
      const vol = parseTitlePattern(book.title);

      let matched = false;
      for (const entry of this.entries) {
        if (shouldGroupTitles(entry.key, key, null, vol.volumeNumber)) {
          entry.bookIds.add(book.id);
          matched = true;
          break;
        }
      }
      if (!matched) {
        this.entries.push({
          bookIds: new Set([book.id]),
          seriesId: null,
          key,
        });
      }
    }

    // 기존 시리즈와 연결
    for (const series of seriesCollections) {
      const seriesKey = computeComparisonKey(series.name);
      for (const entry of this.entries) {
        // 시리즈명이 그룹의 비교 키와 유사하거나, 책 ID가 포함되면 연결
        if (
          shouldGroupTitles(seriesKey, entry.key) ||
          [...entry.bookIds].some((id) => series.bookIds?.includes(id))
        ) {
          entry.seriesId = series.id;
          break;
        }
      }
    }
  }

  /**
   * 새 책을 인덱스에 추가하고 매칭 결과를 반환합니다.
   */
  addBook(book: Book): {
    prefix: string;
    existingBookIds: number[];
    seriesId: number | null;
  } {
    const key = computeComparisonKey(book.title);
    const vol = parseTitlePattern(book.title);

    for (const entry of this.entries) {
      if (shouldGroupTitles(entry.key, key, null, vol.volumeNumber)) {
        entry.bookIds.add(book.id);
        return {
          prefix: key.full,
          existingBookIds: [...entry.bookIds].filter((id) => id !== book.id),
          seriesId: entry.seriesId,
        };
      }
    }

    // 매칭 없음 → 새 엔트리
    this.entries.push({
      bookIds: new Set([book.id]),
      seriesId: null,
      key,
    });

    return {
      prefix: key.full,
      existingBookIds: [],
      seriesId: null,
    };
  }

  /**
   * 특정 접두사(비교 키 full)에 해당하는 엔트리의 시리즈 ID를 설정합니다.
   * 새 시리즈가 생성되었을 때 인덱스에 반영하기 위해 사용합니다.
   */
  setSeriesForPrefix(prefix: string, seriesId: number): void {
    for (const entry of this.entries) {
      if (entry.key.full === prefix) {
        entry.seriesId = seriesId;
        return;
      }
    }
  }

  /**
   * 인덱스에서 책을 제거합니다.
   */
  removeBook(bookId: number): void {
    for (const entry of this.entries) {
      entry.bookIds.delete(bookId);
    }
  }

  /**
   * 인덱스 크기
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * 인덱스 엔트리를 직렬화합니다 (워커 → 메인 전송용).
   */
  serialize(): SerializedIndexEntry[] {
    return this.entries.map((entry) => ({
      bookIds: [...entry.bookIds],
      seriesId: entry.seriesId,
      key: entry.key,
    }));
  }

  /**
   * 직렬화된 데이터로부터 인덱스를 복원합니다.
   * DB 조회 없이 워커에서 전송한 데이터로 인덱스를 재구축합니다.
   */
  loadEntries(data: SerializedIndexEntry[]): void {
    this.entries = data.map((entry) => ({
      bookIds: new Set(entry.bookIds),
      seriesId: entry.seriesId,
      key: entry.key,
    }));
  }
}
