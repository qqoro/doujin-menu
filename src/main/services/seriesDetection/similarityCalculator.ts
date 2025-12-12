/**
 * 유사도 계산 유틸리티
 */

import type { Book } from "../../db/types.js";

/**
 * Levenshtein Distance 계산
 * 두 문자열 간의 편집 거리
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // DP 테이블 생성
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // 초기화
  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  // DP 계산
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // 삭제
        dp[i][j - 1] + 1, // 삽입
        dp[i - 1][j - 1] + cost // 치환
      );
    }
  }

  return dp[len1][len2];
}

/**
 * 정규화된 유사도 계산 (0.0 ~ 1.0)
 * 1.0에 가까울수록 유사함
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);

  return 1.0 - distance / maxLength;
}

/**
 * Jaccard 유사도 계산 (집합 기반)
 * 태그나 작가 리스트 비교에 사용
 */
export function jaccardSimilarity(set1: string[], set2: string[]): number {
  if (set1.length === 0 && set2.length === 0) return 1.0;
  if (set1.length === 0 || set2.length === 0) return 0.0;

  const s1 = new Set(set1.map(s => s.toLowerCase()));
  const s2 = new Set(set2.map(s => s.toLowerCase()));

  const intersection = new Set([...s1].filter(x => s2.has(x)));
  const union = new Set([...s1, ...s2]);

  return intersection.size / union.size;
}

/**
 * 두 책의 작가 일치 여부
 */
export function hasSameArtists(book1: Book, book2: Book): boolean {
  const artists1 = book1.artists?.map(a => a.name.toLowerCase()) || [];
  const artists2 = book2.artists?.map(a => a.name.toLowerCase()) || [];

  if (artists1.length === 0 || artists2.length === 0) return false;

  // 하나라도 겹치면 true
  return artists1.some(a1 => artists2.includes(a1));
}

/**
 * 두 책의 작가 유사도 계산
 */
export function calculateArtistSimilarity(book1: Book, book2: Book): number {
  const artists1 = book1.artists?.map(a => a.name) || [];
  const artists2 = book2.artists?.map(a => a.name) || [];

  return jaccardSimilarity(artists1, artists2);
}

/**
 * 두 책의 태그 유사도 계산
 */
export function calculateTagSimilarity(book1: Book, book2: Book): number {
  const tags1 = book1.tags?.map(t => t.name) || [];
  const tags2 = book2.tags?.map(t => t.name) || [];

  return jaccardSimilarity(tags1, tags2);
}

/**
 * 공통 태그 추출
 */
export function getCommonTags(book1: Book, book2: Book): string[] {
  const tags1 = new Set(book1.tags?.map(t => t.name.toLowerCase()) || []);
  const tags2 = new Set(book2.tags?.map(t => t.name.toLowerCase()) || []);

  return [...tags1].filter(t => tags2.has(t));
}

/**
 * 여러 책들의 공통 태그 추출
 */
export function getCommonTagsFromBooks(books: Book[]): string[] {
  if (books.length === 0) return [];
  if (books.length === 1) return books[0].tags?.map(t => t.name) || [];

  const tagSets = books.map(
    book => new Set(book.tags?.map(t => t.name.toLowerCase()) || [])
  );

  // 첫 번째 책의 태그 중에서 모든 책에 공통으로 있는 태그만 선택
  const firstTags = tagSets[0];
  const commonTags = [...firstTags].filter(tag =>
    tagSets.every(tagSet => tagSet.has(tag))
  );

  return commonTags;
}

/**
 * 제목 유사도 계산 (전처리 포함)
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  // 공백, 특수문자 정규화
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[\s\-_]/g, "")
      .trim();

  const normalized1 = normalize(title1);
  const normalized2 = normalize(title2);

  return calculateSimilarity(normalized1, normalized2);
}
