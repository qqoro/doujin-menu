/**
 * 제목 패턴 분석기
 * 책 제목에서 시리즈명과 권수를 추출
 */

import log from "electron-log";
import type { TitleParseResult } from "./types.js";

// 권수 패턴 정규식들
const VOLUME_PATTERNS = [
  // [시리즈명] 1권, [시리즈명] 제1권
  { regex: /^(.+?)\s*[제]?(\d+)권\s*$/, confidence: 0.95 },
  // [시리즈명] Vol.1, [시리즈명] Vol 1
  { regex: /^(.+?)\s*Vol\.?\s*(\d+)\s*$/i, confidence: 0.9 },
  // [시리즈명] Chapter 1, [시리즈명] Ch.1
  { regex: /^(.+?)\s*(?:Chapter|Ch\.?)\s*(\d+)\s*$/i, confidence: 0.9 },
  // [시리즈명] Part 1, [시리즈명] Pt.1
  { regex: /^(.+?)\s*(?:Part|Pt\.?)\s*(\d+)\s*$/i, confidence: 0.9 },
  // [시리즈명] Episode 1, [시리즈명] Ep.1
  { regex: /^(.+?)\s*(?:Episode|Ep\.?)\s*(\d+)\s*$/i, confidence: 0.85 },
  // [시리즈명] #1
  { regex: /^(.+?)\s*#(\d+)\s*$/, confidence: 0.85 },
  // [시리즈명] - 1, [시리즈명] -1
  { regex: /^(.+?)\s*-\s*(\d+)\s*$/, confidence: 0.8 },
  // [시리즈명] (1), [시리즈명](1)
  { regex: /^(.+?)\s*\((\d+)\)\s*$/, confidence: 0.75 },
  // [시리즈명] 01, [시리즈명] 001 (2-3자리 숫자만)
  { regex: /^(.+?)\s+(\d{2,3})\s*$/, confidence: 0.7 },
  // [시리즈명] 1 (한 자리 숫자) - 마지막에 배치하여 우선순위 낮춤
  { regex: /^(.+?)\s+(\d)\s*$/, confidence: 0.85 },
];

// 특수기호 숫자 매핑 (①, ②, ③, ...)
const CIRCLED_NUMBERS: Record<string, number> = {
  "①": 1,
  "②": 2,
  "③": 3,
  "④": 4,
  "⑤": 5,
  "⑥": 6,
  "⑦": 7,
  "⑧": 8,
  "⑨": 9,
  "⑩": 10,
  "⑪": 11,
  "⑫": 12,
  "⑬": 13,
  "⑭": 14,
  "⑮": 15,
  "⑯": 16,
  "⑰": 17,
  "⑱": 18,
  "⑲": 19,
  "⑳": 20,
};

// 한글 순서 매핑
const KOREAN_ORDER: Record<string, number> = {
  상: 1,
  중: 2,
  하: 3,
  전: 1,
  후: 2,
};

// 대괄호/괄호로 묶인 패턴
const BRACKET_PATTERNS = [
  // [시리즈명] 나머지
  { regex: /^\[(.+?)\]\s*(.*)$/, confidence: 0.85 },
  // (시리즈명) 나머지
  { regex: /^\((.+?)\)\s*(.*)$/, confidence: 0.8 },
  // 「시리즈명」나머지
  { regex: /^「(.+?)」\s*(.*)$/, confidence: 0.85 },
];

// 구분자 기반 패턴
const SEPARATOR_PATTERNS = [
  // 시리즈명 : 부제
  { regex: /^(.+?)\s*[:：]\s*(.+)$/, confidence: 0.7 },
  // 시리즈명 - 부제
  { regex: /^(.+?)\s*[-－—]\s*(.+)$/, confidence: 0.65 },
];

// 한글 숫자 매핑
const KOREAN_NUMBERS: Record<string, number> = {
  일: 1,
  이: 2,
  삼: 3,
  사: 4,
  오: 5,
  육: 6,
  칠: 7,
  팔: 8,
  구: 9,
  십: 10,
};

/**
 * 제목에서 특수기호 숫자 추출 (①, ②, ③ 등)
 */
function extractCircledNumber(
  title: string,
): { number: number; prefix: string } | null {
  for (const [symbol, number] of Object.entries(CIRCLED_NUMBERS)) {
    const index = title.indexOf(symbol);
    if (index !== -1) {
      const prefix = title.substring(0, index).trim();
      if (prefix.length > 0) {
        return { number, prefix };
      }
    }
  }
  return null;
}

/**
 * 제목에서 한글 순서 추출 (상/중/하, 전/후 등)
 */
function extractKoreanOrder(
  title: string,
): { number: number; prefix: string } | null {
  for (const [order, number] of Object.entries(KOREAN_ORDER)) {
    // "시리즈명 상", "시리즈명 상권" 패턴
    const pattern1 = new RegExp(`^(.+?)\\s*${order}\\s*$`);
    const pattern2 = new RegExp(`^(.+?)\\s*${order}권\\s*$`);

    const match = title.match(pattern1) || title.match(pattern2);
    if (match) {
      const prefix = match[1].trim();
      if (prefix.length > 0) {
        return { number, prefix };
      }
    }
  }
  return null;
}

/**
 * 제목에서 한글 부분 추출 (| 기호로 구분된 경우)
 */
function extractKoreanTitle(title: string): string {
  // "English | 한글" 형식인 경우 한글 부분만 추출
  const pipeIndex = title.indexOf("|");
  if (pipeIndex !== -1) {
    const koreanPart = title.substring(pipeIndex + 1).trim();
    if (koreanPart.length > 0) {
      return koreanPart;
    }
  }
  return title;
}

/**
 * 제목에서 시리즈 패턴을 파싱
 */
export function parseTitlePattern(title: string): TitleParseResult {
  const trimmedTitle = title.trim();

  // | 기호가 있으면 한글 부분 우선 파싱
  const titleToParse = extractKoreanTitle(trimmedTitle);

  // 디버깅: 제목 추출 로그
  if (titleToParse !== trimmedTitle) {
    log.debug(`[시리즈 감지] 제목 추출: "${trimmedTitle}" → "${titleToParse}"`);
  }

  // 0. 특수기호 숫자 패턴 시도 (①, ②, ③ 등)
  const circledResult = extractCircledNumber(titleToParse);
  if (circledResult) {
    const result = {
      prefix: circledResult.prefix,
      volumeNumber: circledResult.number,
      originalTitle: trimmedTitle,
      confidence: 0.95,
    };
    log.debug(
      `[시리즈 감지] 파싱 결과 (특수기호): "${trimmedTitle}" → 시리즈명: "${result.prefix}", 권수: ${result.volumeNumber}`,
    );
    return result;
  }

  // 0-1. 한글 순서 패턴 시도 (상/중/하, 전/후)
  const koreanOrderResult = extractKoreanOrder(titleToParse);
  if (koreanOrderResult) {
    const result = {
      prefix: koreanOrderResult.prefix,
      volumeNumber: koreanOrderResult.number,
      originalTitle: trimmedTitle,
      confidence: 0.9,
    };
    log.debug(
      `[시리즈 감지] 파싱 결과 (한글순서): "${trimmedTitle}" → 시리즈명: "${result.prefix}", 권수: ${result.volumeNumber}`,
    );
    return result;
  }

  // 1. 권수 패턴 시도
  for (const pattern of VOLUME_PATTERNS) {
    const match = titleToParse.match(pattern.regex);
    if (match) {
      const prefix = match[1].trim();
      const volumeNumber = parseInt(match[2], 10);

      if (prefix.length > 0 && volumeNumber > 0) {
        const result = {
          prefix,
          volumeNumber,
          originalTitle: trimmedTitle,
          confidence: pattern.confidence,
        };
        log.debug(
          `[시리즈 감지] 파싱 결과 (권수패턴): "${trimmedTitle}" → 시리즈명: "${result.prefix}", 권수: ${result.volumeNumber}`,
        );
        return result;
      }
    }
  }

  // 2. 대괄호/괄호 패턴 시도
  for (const pattern of BRACKET_PATTERNS) {
    const match = titleToParse.match(pattern.regex);
    if (match) {
      const seriesName = match[1].trim();
      const remainder = match[2].trim();

      // 나머지 부분에서 권수 추출 시도
      const volumeMatch = remainder.match(/^[제]?(\d+)권?$/);
      const volumeNumber = volumeMatch ? parseInt(volumeMatch[1], 10) : null;

      if (seriesName.length > 0) {
        return {
          prefix: seriesName,
          volumeNumber,
          originalTitle: trimmedTitle,
          confidence: volumeNumber
            ? pattern.confidence
            : pattern.confidence * 0.8,
        };
      }
    }
  }

  // 3. 구분자 기반 패턴 시도
  for (const pattern of SEPARATOR_PATTERNS) {
    const match = titleToParse.match(pattern.regex);
    if (match) {
      const prefix = match[1].trim();

      if (prefix.length > 2) {
        // 너무 짧은 접두어는 제외
        return {
          prefix,
          volumeNumber: null,
          originalTitle: trimmedTitle,
          confidence: pattern.confidence,
        };
      }
    }
  }

  // 4. 패턴이 발견되지 않으면 전체 제목을 접두어로
  const result = {
    prefix: titleToParse,
    volumeNumber: null,
    originalTitle: trimmedTitle,
    confidence: 0.3, // 낮은 신뢰도
  };

  // 디버깅: 파싱 결과 로그
  log.debug(
    `[시리즈 감지] 파싱 결과: "${trimmedTitle}" → 시리즈명: "${result.prefix}", 권수: ${result.volumeNumber}, 신뢰도: ${result.confidence}`,
  );

  return result;
}

/**
 * 두 제목의 공통 접두어를 추출
 */
export function extractCommonPrefix(title1: string, title2: string): string {
  const len = Math.min(title1.length, title2.length);
  let commonLength = 0;

  for (let i = 0; i < len; i++) {
    if (title1[i] === title2[i]) {
      commonLength = i + 1;
    } else {
      break;
    }
  }

  // 단어 경계에서 자르기 (공백, 괄호, 하이픈 등)
  const prefix = title1.substring(0, commonLength);
  const boundaryMatch = prefix.match(/^(.+?)[\s\-\(\[\{「]?$/);

  return boundaryMatch ? boundaryMatch[1].trim() : prefix.trim();
}

/**
 * 제목들의 공통 접두어를 찾음 (여러 제목)
 */
export function findCommonPrefix(titles: string[]): string | null {
  if (titles.length === 0) return null;
  if (titles.length === 1) return titles[0];

  let commonPrefix = titles[0];

  for (let i = 1; i < titles.length; i++) {
    commonPrefix = extractCommonPrefix(commonPrefix, titles[i]);

    if (commonPrefix.length < 2) {
      // 공통 부분이 너무 짧으면 실패
      return null;
    }
  }

  return commonPrefix;
}

/**
 * 제목에서 숫자 추출 (권수로 사용 가능한 숫자들)
 */
export function extractNumbers(title: string): number[] {
  const numbers: number[] = [];

  // 특수기호 숫자 추출 (①, ②, ③ 등)
  for (const [symbol, num] of Object.entries(CIRCLED_NUMBERS)) {
    if (title.includes(symbol)) {
      numbers.push(num);
    }
  }

  // 한글 순서 추출 (상/중/하, 전/후)
  for (const [order, num] of Object.entries(KOREAN_ORDER)) {
    if (title.includes(order + "권") || title.endsWith(order)) {
      numbers.push(num);
    }
  }

  // 아라비아 숫자 추출
  const arabicMatches = title.match(/\d+/g);
  if (arabicMatches) {
    numbers.push(...arabicMatches.map((n) => parseInt(n, 10)));
  }

  // 한글 숫자 추출 (간단한 경우만)
  for (const [korean, num] of Object.entries(KOREAN_NUMBERS)) {
    if (title.includes(korean + "권")) {
      numbers.push(num);
    }
  }

  return numbers;
}

/**
 * 제목이 시리즈 패턴을 가지고 있는지 확인
 */
export function hasSeriesPattern(title: string): boolean {
  const parseResult = parseTitlePattern(title);
  return parseResult.confidence > 0.6;
}
