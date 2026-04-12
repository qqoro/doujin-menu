import log from "electron-log";
import type { Book } from "../../db/types.js";
import {
  calculateBookConfidence,
  calculateCandidateConfidence,
} from "./confidenceScorer.js";
import {
  getCommonTagsFromBooks,
  hasSameArtists,
} from "./similarityCalculator.js";
import { findCommonPrefix, parseTitlePattern } from "./titlePatternMatcher.js";
import type {
  BookWithScore,
  DetectionOptions,
  DetectionReason,
  DetectionResult,
  IncrementalDetectionResult,
  SeriesCandidate,
} from "./types.js";

// 기본 감지 옵션
const DEFAULT_OPTIONS: DetectionOptions = {
  minConfidence: 0.7,
  minBooks: 2,
  requireArtistMatch: false,
  protectManualEdits: true,
};

// 성능 최적화: 최대 그룹 크기 (이 이상이면 건너뜀)
const MAX_GROUP_SIZE = 500;

/**
 * 책들을 분석하여 시리즈 후보 그룹들을 생성
 */
export async function detectSeriesCandidates(
  books: Book[],
  options: Partial<DetectionOptions> = {},
): Promise<DetectionResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const candidates: SeriesCandidate[] = [];
  const processedBookIds = new Set<number>();

  // 1. 제목 패턴 기반 그룹화
  const patternGroups = groupByTitlePattern(books);

  for (const group of patternGroups) {
    if (group.books.length < opts.minBooks) continue;
    // 성능 최적화: 너무 큰 그룹은 건너뜀
    if (group.books.length > MAX_GROUP_SIZE) {
      log.debug(
        `[시리즈 감지] 그룹 "${group.seriesName}"이 너무 큼 (${group.books.length}권) - 건너뜀`,
      );
      continue;
    }

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
    const booksWithVolume = booksWithScore.filter(
      (b) => b.volumeNumber !== null,
    );
    const booksWithoutVolume = booksWithScore.filter(
      (b) => b.volumeNumber === null,
    );

    // 숫자가 없는 책이 한 권만 있고, 1권이 명시적으로 없을 때
    if (booksWithoutVolume.length === 1 && booksWithVolume.length > 0) {
      const hasExplicitVolumeOne = booksWithVolume.some(
        (b) => b.volumeNumber === 1,
      );

      if (!hasExplicitVolumeOne) {
        // 1권이 없으면 숫자 없는 책을 1권으로 설정
        booksWithoutVolume[0].volumeNumber = 1;
        booksWithoutVolume[0].orderIndex = 1;
      }
    }

    log.debug(
      `[시리즈 감지] 그룹 "${group.seriesName}" 정렬 전:`,
      booksWithScore.map((b) => ({
        title: b.book.title,
        volumeNumber: b.volumeNumber,
        orderIndex: b.orderIndex,
      })),
    );

    booksWithScore.sort((a, b) => {
      if (a.volumeNumber !== null && b.volumeNumber !== null) {
        return a.volumeNumber - b.volumeNumber;
      }
      if (a.volumeNumber !== null) return -1;
      if (b.volumeNumber !== null) return 1;
      return a.book.title.localeCompare(b.book.title);
    });

    // 정렬 후 orderIndex를 실제 정렬 순서에 맞게 재계산
    booksWithScore.forEach((b, i) => {
      b.orderIndex = i + 1;
    });

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
      .map((b) => b.volumeNumber)
      .filter((v): v is number => v !== null);
    if (volumeNumbers.length >= 2) {
      detectionReasons.push({
        type: "volume_sequence",
        sequence: volumeNumbers,
      });
    }

    // 공통 태그 확인
    const commonTags = getCommonTagsFromBooks(filteredBooks);
    if (commonTags.length > 0) {
      detectionReasons.push({ type: "tag_similarity", commonTags });
    }

    // 후보 생성
    // 시리즈명은 파싱된 접두사 사용 (원본 제목 대신)
    const candidate: SeriesCandidate = {
      seriesName: group.seriesName,
      books: booksWithScore,
      confidence: 0, // 나중에 계산
      detectionReason: detectionReasons,
    };

    // 최종 신뢰도 계산
    candidate.confidence = calculateCandidateConfidence(candidate);

    // 신뢰도 임계값 확인
    if (candidate.confidence >= opts.minConfidence) {
      candidates.push(candidate);
      booksWithScore.forEach((b) => processedBookIds.add(b.book.id));
    }
  }

  // 2. 작가 + 제목 유사도 기반 그룹화 (패턴 매칭에서 누락된 책들)
  const remainingBooks = books.filter((b) => !processedBookIds.has(b.id));
  const artistGroups = groupByArtistAndSimilarity(remainingBooks);

  for (const group of artistGroups) {
    if (group.books.length < opts.minBooks) continue;

    // 유사도 기반 그룹에 대해서도 제목 패턴 기반과 동일한 로직을 적용
    const booksWithScore: BookWithScore[] = group.books.map((book, index) => {
      const parseResult = parseTitlePattern(book.title);
      const confidence = calculateBookConfidence(book, group.books);

      return {
        book,
        confidence,
        volumeNumber: parseResult.volumeNumber,
        orderIndex: parseResult.volumeNumber || index + 1,
      };
    });

    // 숫자 없는 책을 1권으로 처리하는 로직 추가
    const booksWithVolume = booksWithScore.filter(
      (b) => b.volumeNumber !== null,
    );
    const booksWithoutVolume = booksWithScore.filter(
      (b) => b.volumeNumber === null,
    );

    if (booksWithoutVolume.length === 1 && booksWithVolume.length > 0) {
      const hasExplicitVolumeOne = booksWithVolume.some(
        (b) => b.volumeNumber === 1,
      );

      if (!hasExplicitVolumeOne) {
        booksWithoutVolume[0].volumeNumber = 1;
        booksWithoutVolume[0].orderIndex = 1;
      }
    }

    booksWithScore.sort((a, b) => {
      if (a.volumeNumber !== null && b.volumeNumber !== null) {
        return a.volumeNumber - b.volumeNumber;
      }
      if (a.volumeNumber !== null) return -1;
      if (b.volumeNumber !== null) return 1;
      return a.book.title.localeCompare(b.book.title);
    });

    // 정렬 후 orderIndex를 실제 정렬 순서에 맞게 재계산
    booksWithScore.forEach((b, i) => {
      b.orderIndex = i + 1;
    });

    const detectionReasons: DetectionReason[] = [];
    if (group.books[0].artists?.[0]) {
      detectionReasons.push({
        type: "artist_match",
        artistName: group.books[0].artists[0].name,
      });
    }

    // 시리즈명은 공통 접두사 사용
    const candidate: SeriesCandidate = {
      seriesName: group.seriesName,
      books: booksWithScore,
      confidence: 0,
      detectionReason: detectionReasons,
    };

    candidate.confidence = calculateCandidateConfidence(candidate);

    if (candidate.confidence >= opts.minConfidence) {
      candidates.push(candidate);
      booksWithScore.forEach((b) => processedBookIds.add(b.book.id));
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
 * 대소문자 구분 없이 접두사를 비교합니다.
 */
function groupByTitlePattern(
  books: Book[],
): Array<{ seriesName: string; books: Book[] }> {
  const groups = new Map<string, Book[]>();
  const groupConfidence = new Map<string, number>();

  // 1. 모든 책을 접두사 기준으로 그룹화하고, 그룹별 최고 신뢰도를 추적합니다.
  for (const book of books) {
    const parseResult = parseTitlePattern(book.title);
    const seriesName = parseResult.prefix;

    if (!seriesName) {
      continue;
    }

    // 대소문자 무시: 맵 키는 소문자로 통일
    const groupKey = seriesName.toLowerCase();

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      groupConfidence.set(groupKey, 0);
    }
    groups.get(groupKey)!.push(book);

    // 그룹의 신뢰도를 가장 높은 책의 신뢰도로 업데이트합니다.
    if (parseResult.confidence > groupConfidence.get(groupKey)!) {
      groupConfidence.set(groupKey, parseResult.confidence);
    }
  }

  // 2. 신뢰도 임계값을 넘는 그룹만 필터링합니다.
  const finalGroups: Array<{ seriesName: string; books: Book[] }> = [];
  for (const [groupKey, bookList] of groups.entries()) {
    // 그룹 내에 신뢰도 높은 책이 하나라도 있으면 유효한 그룹으로 판단합니다.
    if (groupConfidence.get(groupKey)! >= 0.6) {
      // seriesName은 첫 번째 책의 원본 접두사를 사용 (대소문자 보존)
      const firstBookPrefix = parseTitlePattern(bookList[0].title).prefix;
      finalGroups.push({
        seriesName: firstBookPrefix || groupKey,
        books: bookList,
      });
    }
  }

  return finalGroups;
}

/**
 * 작가 일치 기준으로 필터링
 */
function filterByArtistMatch(books: Book[]): Book[] {
  if (books.length === 0) return [];

  // 가장 많이 등장하는 작가를 찾음
  const artistCounts = new Map<string, number>();

  for (const book of books) {
    const artists = book.artists?.map((a) => a.name.toLowerCase()) || [];
    for (const artist of artists) {
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
  }

  const [primaryArtist] =
    Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1])[0] || [];

  if (!primaryArtist) return books;

  // 해당 작가의 작품만 필터링
  return books.filter((book) =>
    book.artists?.some((a) => a.name.toLowerCase() === primaryArtist),
  );
}

/**
 * 모든 책이 같은 작가인지 확인
 */
function checkAllHaveSameArtist(books: Book[]): boolean {
  if (books.length <= 1) return false;

  const firstArtists = books[0].artists?.map((a) => a.name.toLowerCase()) || [];
  if (firstArtists.length === 0) return false;

  return books.every((book) =>
    book.artists?.some((a) => firstArtists.includes(a.name.toLowerCase())),
  );
}

/**
 * 작가와 제목 유사도로 그룹화
 */
function groupByArtistAndSimilarity(
  books: Book[],
): Array<{ seriesName: string; books: Book[] }> {
  const groups: Array<{ seriesName: string; books: Book[] }> = [];

  // 작가별로 먼저 분류 (대소문자 무시)
  const artistGroups = new Map<string, Book[]>();

  for (const book of books) {
    const artists = book.artists?.map((a) => a.name) || [];
    for (const artist of artists) {
      const key = artist.toLowerCase();
      if (!artistGroups.has(key)) {
        artistGroups.set(key, []);
      }
      artistGroups.get(key)!.push(book);
    }
  }

  // 각 작가 그룹 내에서 제목 공통 부분 찾기
  for (const [, artistBooks] of artistGroups) {
    if (artistBooks.length < 2) continue;

    const titles = artistBooks.map((b) => b.title);
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
  options: Partial<DetectionOptions> = {},
): Promise<SeriesCandidate | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 제목 패턴 파싱
  const parseResult = parseTitlePattern(targetBook.title);

  if (parseResult.confidence < 0.6) {
    // 패턴이 약하면 null 반환
    return null;
  }

  // 같은 패턴의 다른 책들 찾기
  const similarBooks = allBooks.filter((book) => {
    if (book.id === targetBook.id) return false;

    const otherParse = parseTitlePattern(book.title);
    if (otherParse.prefix.toLowerCase() !== parseResult.prefix.toLowerCase())
      return false;

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

  const booksWithScore: BookWithScore[] = candidateBooks.map((book) => {
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

/**
 * 증분 감지: PrefixIndex를 활용하여 새 책들을 기존 시리즈에 매칭
 * 전체 재감지 없이 O(1) 조회로 새 책을 처리합니다.
 *
 * @param newBooks - 새로 추가된 책 목록
 * @param prefixIndex - 접두사 인덱스
 * @param options - 감지 옵션
 * @returns 매칭 결과 (DB 저장은 호출자가 담당)
 */
export async function detectSeriesIncremental(
  newBooks: Book[],
  prefixIndex: {
    addBook(book: Book): {
      prefix: string;
      existingBookIds: number[];
      seriesId: number | null;
    };
  },
  options: Partial<DetectionOptions> = {},
): Promise<IncrementalDetectionResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let addedToExisting = 0;
  let newSeriesCreated = 0;
  let unmatched = 0;

  // 접두사별로 새 책 그룹화
  const newBookGroups = new Map<string, Book[]>();

  for (const book of newBooks) {
    const result = prefixIndex.addBook(book);

    if (result.seriesId !== null) {
      // 기존 시리즈에 추가 가능
      addedToExisting++;
    } else if (result.existingBookIds.length > 0) {
      // 기존 미할당 책과 매칭 → 새 시리즈 후보
      const key = result.prefix.toLowerCase();
      if (!newBookGroups.has(key)) {
        newBookGroups.set(key, []);
      }
      newBookGroups.get(key)!.push(book);
    } else {
      // 매칭 없음 → 새 접두사
      const key = result.prefix.toLowerCase();
      if (!newBookGroups.has(key)) {
        newBookGroups.set(key, []);
      }
      newBookGroups.get(key)!.push(book);
    }
  }

  // 새 책끼리 시리즈를 형성할 수 있는지 확인
  for (const [, books] of newBookGroups) {
    if (books.length >= opts.minBooks) {
      // 파싱 신뢰도 확인
      const highConfBooks = books.filter((b) => {
        const parseResult = parseTitlePattern(b.title);
        return parseResult.confidence >= 0.6;
      });

      if (highConfBooks.length >= opts.minBooks) {
        newSeriesCreated++;
      } else {
        unmatched += books.length;
      }
    } else {
      unmatched += books.length;
    }
  }

  return {
    addedToExisting,
    newSeriesCreated,
    unmatched,
    duration: Date.now() - startTime,
  };
}
