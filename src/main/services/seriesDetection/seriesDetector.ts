/**
 * 메인 시리즈 자동 감지 로직
 */

import log from "electron-log";
import type { Book } from "../../db/types.js";
import type {
  DetectionOptions,
  DetectionResult,
  SeriesCandidate,
  BookWithScore,
  DetectionReason,
} from "./types.js";
import {
  parseTitlePattern,
  findCommonPrefix,
  extractNumbers,
} from "./titlePatternMatcher.js";
import {
  hasSameArtists,
  getCommonTagsFromBooks,
} from "./similarityCalculator.js";
import {
  calculateBookConfidence,
  calculateCandidateConfidence,
} from "./confidenceScorer.js";

// 기본 감지 옵션
const DEFAULT_OPTIONS: DetectionOptions = {
  minConfidence: 0.7,
  minBooks: 2,
  requireArtistMatch: false,
  protectManualEdits: true,
};

/**
 * 책들을 분석하여 시리즈 후보 그룹들을 생성
 */
export async function detectSeriesCandidates(
  books: Book[],
  options: Partial<DetectionOptions> = {}
): Promise<DetectionResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const candidates: SeriesCandidate[] = [];
  const processedBookIds = new Set<number>();

  // 1. 제목 패턴 기반 그룹화
  const patternGroups = groupByTitlePattern(books);

  for (const group of patternGroups) {
    if (group.books.length < opts.minBooks) continue;

    // 작가 일치 필터링 (옵션)
    let filteredBooks = group.books;
    if (opts.requireArtistMatch) {
      filteredBooks = filterByArtistMatch(group.books);
      if (filteredBooks.length < opts.minBooks) continue;
    }

    // 각 책의 신뢰도 계산
    const booksWithScore: BookWithScore[] = filteredBooks.map((book, index) => {
      const parseResult = parseTitlePattern(book.title);
      const confidence = calculateBookConfidence(book, filteredBooks);

      return {
        book,
        confidence,
        volumeNumber: parseResult.volumeNumber,
        orderIndex: parseResult.volumeNumber || index + 1,
      };
    });

    // 숫자 없는 책을 1권으로 처리하는 로직
    const booksWithVolume = booksWithScore.filter(b => b.volumeNumber !== null);
    const booksWithoutVolume = booksWithScore.filter(b => b.volumeNumber === null);

    // 숫자가 없는 책이 있고, 1권이 명시적으로 없을 때
    if (booksWithoutVolume.length > 0 && booksWithVolume.length > 0) {
      const hasExplicitVolumeOne = booksWithVolume.some(b => b.volumeNumber === 1);

      if (!hasExplicitVolumeOne) {
        // 1권이 없으면 숫자 없는 책 중 첫 번째를 1권으로 설정
        booksWithoutVolume[0].volumeNumber = 1;
        booksWithoutVolume[0].orderIndex = 1;
      }
    }

    // 디버깅: 정렬 전 책 정보 로그
    log.debug(
      `[시리즈 감지] 그룹 "${group.seriesName}" 정렬 전:`,
      booksWithScore.map((b) => ({
        title: b.book.title,
        volumeNumber: b.volumeNumber,
        orderIndex: b.orderIndex,
      })),
    );

    // 순서대로 정렬
    booksWithScore.sort((a, b) => {
      if (a.volumeNumber !== null && b.volumeNumber !== null) {
        return a.volumeNumber - b.volumeNumber;
      }
      if (a.volumeNumber !== null) return -1;
      if (b.volumeNumber !== null) return 1;
      return a.book.title.localeCompare(b.book.title);
    });

    // 디버깅: 정렬 후 책 정보 로그
    log.debug(
      `[시리즈 감지] 그룹 "${group.seriesName}" 정렬 후:`,
      booksWithScore.map((b) => ({
        title: b.book.title,
        volumeNumber: b.volumeNumber,
        orderIndex: b.orderIndex,
      })),
    );

    // 감지 근거 수집
    const detectionReasons: DetectionReason[] = [];
    detectionReasons.push({ type: "title_pattern", pattern: group.seriesName });

    // 작가 일치 확인
    const allHaveSameArtist = checkAllHaveSameArtist(filteredBooks);
    if (allHaveSameArtist && filteredBooks[0].artists?.[0]) {
      detectionReasons.push({
        type: "artist_match",
        artistName: filteredBooks[0].artists[0].name,
      });
    }

    // 권수 연속성 확인
    const volumeNumbers = booksWithScore
      .map(b => b.volumeNumber)
      .filter((v): v is number => v !== null);
    if (volumeNumbers.length >= 2) {
      detectionReasons.push({ type: "volume_sequence", sequence: volumeNumbers });
    }

    // 공통 태그 확인
    const commonTags = getCommonTagsFromBooks(filteredBooks);
    if (commonTags.length > 0) {
      detectionReasons.push({ type: "tag_similarity", commonTags });
    }

    // 후보 생성
    // 시리즈명은 첫 번째 책(order_index 기준)의 제목 사용
    const firstBook = booksWithScore.length > 0 ? booksWithScore[0] : null;
    const seriesName = firstBook ? firstBook.book.title : group.seriesName;

    const candidate: SeriesCandidate = {
      seriesName,
      books: booksWithScore,
      confidence: 0, // 나중에 계산
      detectionReason: detectionReasons,
    };

    // 최종 신뢰도 계산
    candidate.confidence = calculateCandidateConfidence(candidate);

    // 신뢰도 임계값 확인
    if (candidate.confidence >= opts.minConfidence) {
      candidates.push(candidate);
      booksWithScore.forEach(b => processedBookIds.add(b.book.id));
    }
  }

  // 2. 작가 + 제목 유사도 기반 그룹화 (패턴 매칭에서 누락된 책들)
  const remainingBooks = books.filter(b => !processedBookIds.has(b.id));
  const artistGroups = groupByArtistAndSimilarity(remainingBooks);

  for (const group of artistGroups) {
    if (group.books.length < opts.minBooks) continue;

    const booksWithScore: BookWithScore[] = group.books.map((book, index) => ({
      book,
      confidence: calculateBookConfidence(book, group.books),
      volumeNumber: null,
      orderIndex: index + 1,
    }));

    const detectionReasons: DetectionReason[] = [];
    if (group.books[0].artists?.[0]) {
      detectionReasons.push({
        type: "artist_match",
        artistName: group.books[0].artists[0].name,
      });
    }

    // 시리즈명은 첫 번째 책 제목 사용
    const firstBook = booksWithScore.length > 0 ? booksWithScore[0] : null;
    const seriesName = firstBook ? firstBook.book.title : group.seriesName;

    const candidate: SeriesCandidate = {
      seriesName,
      books: booksWithScore,
      confidence: 0,
      detectionReason: detectionReasons,
    };

    candidate.confidence = calculateCandidateConfidence(candidate);

    if (candidate.confidence >= opts.minConfidence) {
      candidates.push(candidate);
      booksWithScore.forEach(b => processedBookIds.add(b.book.id));
    }
  }

  const duration = Date.now() - startTime;

  return {
    candidates,
    processedBooks: processedBookIds.size,
    duration,
  };
}

/**
 * 제목 패턴으로 그룹화
 */
function groupByTitlePattern(books: Book[]): Array<{ seriesName: string; books: Book[] }> {
  const groups = new Map<string, Book[]>();

  for (const book of books) {
    const parseResult = parseTitlePattern(book.title);

    // 신뢰도가 너무 낮으면 스킵
    if (parseResult.confidence < 0.6) continue;

    const seriesName = parseResult.prefix;

    if (!groups.has(seriesName)) {
      groups.set(seriesName, []);
    }
    groups.get(seriesName)!.push(book);
  }

  return Array.from(groups.entries()).map(([seriesName, books]) => ({
    seriesName,
    books,
  }));
}

/**
 * 작가 일치 기준으로 필터링
 */
function filterByArtistMatch(books: Book[]): Book[] {
  if (books.length === 0) return [];

  // 가장 많이 등장하는 작가를 찾음
  const artistCounts = new Map<string, number>();

  for (const book of books) {
    const artists = book.artists?.map(a => a.name.toLowerCase()) || [];
    for (const artist of artists) {
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
  }

  const [primaryArtist] = Array.from(artistCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0] || [];

  if (!primaryArtist) return books;

  // 해당 작가의 작품만 필터링
  return books.filter(book =>
    book.artists?.some(a => a.name.toLowerCase() === primaryArtist)
  );
}

/**
 * 모든 책이 같은 작가인지 확인
 */
function checkAllHaveSameArtist(books: Book[]): boolean {
  if (books.length <= 1) return false;

  const firstArtists = books[0].artists?.map(a => a.name.toLowerCase()) || [];
  if (firstArtists.length === 0) return false;

  return books.every(book =>
    book.artists?.some(a => firstArtists.includes(a.name.toLowerCase()))
  );
}

/**
 * 작가와 제목 유사도로 그룹화
 */
function groupByArtistAndSimilarity(
  books: Book[]
): Array<{ seriesName: string; books: Book[] }> {
  const groups: Array<{ seriesName: string; books: Book[] }> = [];

  // 작가별로 먼저 분류
  const artistGroups = new Map<string, Book[]>();

  for (const book of books) {
    const artists = book.artists?.map(a => a.name) || [];
    for (const artist of artists) {
      if (!artistGroups.has(artist)) {
        artistGroups.set(artist, []);
      }
      artistGroups.get(artist)!.push(book);
    }
  }

  // 각 작가 그룹 내에서 제목 공통 부분 찾기
  for (const [artist, artistBooks] of artistGroups) {
    if (artistBooks.length < 2) continue;

    const titles = artistBooks.map(b => b.title);
    const commonPrefix = findCommonPrefix(titles);

    if (commonPrefix && commonPrefix.length > 2) {
      groups.push({
        seriesName: commonPrefix,
        books: artistBooks,
      });
    }
  }

  return groups;
}

/**
 * 특정 책에 대해서만 시리즈 감지 (증분 모드)
 */
export async function detectSeriesForBook(
  targetBook: Book,
  allBooks: Book[],
  options: Partial<DetectionOptions> = {}
): Promise<SeriesCandidate | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 제목 패턴 파싱
  const parseResult = parseTitlePattern(targetBook.title);

  if (parseResult.confidence < 0.6) {
    // 패턴이 약하면 null 반환
    return null;
  }

  // 같은 패턴의 다른 책들 찾기
  const similarBooks = allBooks.filter(book => {
    if (book.id === targetBook.id) return false;

    const otherParse = parseTitlePattern(book.title);
    if (otherParse.prefix !== parseResult.prefix) return false;

    // 작가 일치 확인 (옵션)
    if (opts.requireArtistMatch && !hasSameArtists(targetBook, book)) {
      return false;
    }

    return true;
  });

  if (similarBooks.length < opts.minBooks - 1) {
    // 최소 책 수 미달
    return null;
  }

  const candidateBooks = [targetBook, ...similarBooks];

  const booksWithScore: BookWithScore[] = candidateBooks.map(book => {
    const parse = parseTitlePattern(book.title);
    return {
      book,
      confidence: calculateBookConfidence(book, candidateBooks),
      volumeNumber: parse.volumeNumber,
      orderIndex: parse.volumeNumber || 0,
    };
  });

  booksWithScore.sort((a, b) => {
    if (a.volumeNumber !== null && b.volumeNumber !== null) {
      return a.volumeNumber - b.volumeNumber;
    }
    return 0;
  });

  const candidate: SeriesCandidate = {
    seriesName: parseResult.prefix,
    books: booksWithScore,
    confidence: 0,
    detectionReason: [{ type: "title_pattern", pattern: parseResult.prefix }],
  };

  candidate.confidence = calculateCandidateConfidence(candidate);

  if (candidate.confidence >= opts.minConfidence) {
    return candidate;
  }

  return null;
}
