/**
 * 시리즈 감지 관련 타입 정의
 */

import type { Book } from "../../db/types.js";

// 제목 파싱 결과
export interface TitleParseResult {
  // 공통 접두어 (시리즈명으로 사용될 부분)
  prefix: string;
  // 권수/에피소드 번호
  volumeNumber: number | null;
  // 원본 제목
  originalTitle: string;
  // 파싱 신뢰도 (0.0 ~ 1.0)
  confidence: number;
}

// 시리즈 후보 그룹
export interface SeriesCandidate {
  // 추론된 시리즈명
  seriesName: string;
  // 그룹에 속한 책들
  books: BookWithScore[];
  // 그룹 전체 신뢰도
  confidence: number;
  // 감지 근거
  detectionReason: DetectionReason[];
}

// 점수가 포함된 책 정보
export interface BookWithScore {
  book: Book;
  // 이 책이 시리즈에 속할 신뢰도
  confidence: number;
  // 추론된 권수
  volumeNumber: number | null;
  // 시리즈 내 예상 순서
  orderIndex: number;
}

// 감지 근거
export type DetectionReason =
  | { type: "title_pattern"; pattern: string }
  | { type: "artist_match"; artistName: string }
  | { type: "tag_similarity"; commonTags: string[] }
  | { type: "volume_sequence"; sequence: number[] };

// 자동 감지 옵션
export interface DetectionOptions {
  // 최소 신뢰도 임계값 (이 값 이상만 자동 생성)
  minConfidence: number;
  // 최소 책 수 (이 수 이상의 책이 있어야 시리즈로 간주)
  minBooks: number;
  // 작가 일치 여부 강제
  requireArtistMatch: boolean;
  // 수동 편집된 시리즈 보호
  protectManualEdits: boolean;
}

// 자동 감지 결과
export interface DetectionResult {
  // 생성된 시리즈 후보들
  candidates: SeriesCandidate[];
  // 처리된 책 수
  processedBooks: number;
  // 걸린 시간 (ms)
  duration: number;
}
