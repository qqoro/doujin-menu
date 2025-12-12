/**
 * 신뢰도 점수 계산기
 * 여러 요소를 종합하여 시리즈 감지 신뢰도를 계산
 */

import type { Book } from "../../db/types.js";
import type { BookWithScore, SeriesCandidate } from "./types.js";
import {
  calculateTitleSimilarity,
  calculateArtistSimilarity,
  calculateTagSimilarity,
} from "./similarityCalculator.js";
import { parseTitlePattern } from "./titlePatternMatcher.js";

/**
 * 개별 책이 시리즈에 속할 신뢰도 계산
 */
export function calculateBookConfidence(
  book: Book,
  candidateBooks: Book[]
): number {
  let totalScore = 0;
  let weights = 0;

  // 1. 제목 패턴 분석 (가중치: 0.4)
  const titleParse = parseTitlePattern(book.title);
  if (titleParse.volumeNumber !== null) {
    // 권수가 명확하면 높은 점수
    totalScore += titleParse.confidence * 0.4;
    weights += 0.4;
  } else if (titleParse.confidence > 0.6) {
    // 패턴은 있지만 권수가 없으면 중간 점수
    totalScore += titleParse.confidence * 0.3;
    weights += 0.4;
  }

  // 2. 다른 책들과의 작가 일치도 (가중치: 0.3)
  const artistScores = candidateBooks
    .filter(b => b.id !== book.id)
    .map(b => calculateArtistSimilarity(book, b));

  if (artistScores.length > 0) {
    const avgArtistScore = artistScores.reduce((a, b) => a + b, 0) / artistScores.length;
    totalScore += avgArtistScore * 0.3;
    weights += 0.3;
  }

  // 3. 다른 책들과의 태그 유사도 (가중치: 0.2)
  const tagScores = candidateBooks
    .filter(b => b.id !== book.id)
    .map(b => calculateTagSimilarity(book, b));

  if (tagScores.length > 0) {
    const avgTagScore = tagScores.reduce((a, b) => a + b, 0) / tagScores.length;
    totalScore += avgTagScore * 0.2;
    weights += 0.2;
  }

  // 4. 제목 유사도 (가중치: 0.1)
  const titleScores = candidateBooks
    .filter(b => b.id !== book.id)
    .map(b => calculateTitleSimilarity(book.title, b.title));

  if (titleScores.length > 0) {
    const avgTitleScore = titleScores.reduce((a, b) => a + b, 0) / titleScores.length;
    totalScore += avgTitleScore * 0.1;
    weights += 0.1;
  }

  // 가중치로 정규화
  return weights > 0 ? totalScore / weights : 0;
}

/**
 * 추가된 날짜 기반 연속성 점수 계산
 */
function calculateDateContinuityScore(books: BookWithScore[]): number {
  if (books.length < 2) return 0;

  // added_at 기준으로 정렬
  const sortedByDate = [...books]
    .filter(b => b.book.added_at)
    .sort((a, b) => new Date(a.book.added_at!).getTime() - new Date(b.book.added_at!).getTime());

  if (sortedByDate.length < 2) return 0;

  // 권수가 있는 책들만 필터링
  const booksWithVolume = sortedByDate.filter(b => b.volumeNumber !== null);
  if (booksWithVolume.length < 2) return 0;

  // 날짜순과 권수순이 일치하는지 확인
  let matchCount = 0;
  for (let i = 1; i < booksWithVolume.length; i++) {
    const prevVolume = booksWithVolume[i - 1].volumeNumber!;
    const currVolume = booksWithVolume[i].volumeNumber!;

    // 이전 권보다 현재 권이 더 크면 일치
    if (currVolume > prevVolume) {
      matchCount++;
    }
  }

  // 일치 비율 계산
  return matchCount / (booksWithVolume.length - 1);
}

/**
 * 시리즈 그룹 전체의 신뢰도 계산
 */
export function calculateGroupConfidence(books: BookWithScore[]): number {
  if (books.length === 0) return 0;
  if (books.length === 1) return 0.3; // 단일 책은 낮은 신뢰도

  // 1. 개별 책 신뢰도의 평균 (가중치: 0.4)
  const avgBookConfidence =
    books.reduce((sum, b) => sum + b.confidence, 0) / books.length;

  // 2. 권수 연속성 점수 (가중치: 0.25)
  const volumeNumbers = books
    .map(b => b.volumeNumber)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  let continuityScore = 0;
  if (volumeNumbers.length >= 2) {
    // 연속된 숫자가 많을수록 높은 점수
    const isSequential = volumeNumbers.every(
      (num, i) => i === 0 || num === volumeNumbers[i - 1] + 1
    );

    if (isSequential) {
      continuityScore = 1.0;
    } else {
      // 부분적으로 연속된 경우
      const gaps = volumeNumbers.slice(1).map((num, i) => num - volumeNumbers[i]);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      continuityScore = Math.max(0, 1 - (avgGap - 1) / 10);
    }
  }

  // 3. 날짜 연속성 점수 (가중치: 0.15)
  const dateContinuityScore = calculateDateContinuityScore(books);

  // 4. 책 수 보너스 (가중치: 0.2)
  // 책이 많을수록 신뢰도 증가 (최대 10권까지)
  const bookCountBonus = Math.min(books.length / 10, 1.0);

  // 종합 점수
  return (
    avgBookConfidence * 0.4 +
    continuityScore * 0.25 +
    dateContinuityScore * 0.15 +
    bookCountBonus * 0.2
  );
}

/**
 * 시리즈 후보의 최종 신뢰도 계산
 */
export function calculateCandidateConfidence(candidate: SeriesCandidate): number {
  const groupScore = calculateGroupConfidence(candidate.books);

  // 감지 근거에 따른 보너스
  let reasonBonus = 0;
  for (const reason of candidate.detectionReason) {
    switch (reason.type) {
      case "title_pattern":
        reasonBonus += 0.1;
        break;
      case "artist_match":
        reasonBonus += 0.15;
        break;
      case "volume_sequence":
        reasonBonus += 0.2;
        break;
      case "tag_similarity":
        reasonBonus += 0.05;
        break;
    }
  }

  // 최대 1.0으로 제한
  return Math.min(groupScore + reasonBonus, 1.0);
}

/**
 * 신뢰도에 따른 등급 분류
 */
export function getConfidenceLevel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

/**
 * 신뢰도 임계값 확인
 */
export function meetsConfidenceThreshold(
  confidence: number,
  threshold: number
): boolean {
  return confidence >= threshold;
}
