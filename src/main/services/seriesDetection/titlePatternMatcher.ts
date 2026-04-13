/**
 * 제목 패턴 분석기
 * 책 제목에서 시리즈명과 권수를 추출
 */

import log from "electron-log";
import type { TitleParseResult } from "./types.js";
import { preprocessTitle } from "./titlePreprocessor.js";

const SPIN_OFF_KEYWORDS = [
  "외전",
  "오마케",
  "omake",
  "extra",
  "special",
  "단편",
  "특별편",
  "side story",
];

// 권수 패턴 정규식들
// 주의: \b는 [a-zA-Z0-9_]만 인식하므로 한글(권, 화) 뒤에 \b를 쓰면 매칭 실패함
// 한글 접미사가 있는 패턴은 (?:\s|$)를 사용하여 단어 경계를 처리
const VOLUME_PATTERNS = [
  // [시리즈명] 1권, [시리즈명] 제1권
  { regex: /^(.+?)\s*[제]?(\d+)권(?:\s|$)/i, confidence: 0.95 },
  // [시리즈명] 1화, [시리즈명] 제1화
  { regex: /^(.+?)\s*[제]?(\d+)화(?:\s|$)/i, confidence: 0.95 },
  // [시리즈명] Vol.1, [시리즈명] Vol 1
  { regex: /^(.+?)\s*Vol\.?\s*(\d+)\b/i, confidence: 0.9 },
  // [시리즈명] v.1, [시리즈명] v1 (소문자 v 패턴)
  { regex: /^(.+?)\s*v\.?\s*(\d+)\b/i, confidence: 0.85 },
  // [시리즈명] Chapter 1, [시리즈명] Ch.1
  { regex: /^(.+?)\s*(?:Chapter|Ch\.?)\s*(\d+)\b/i, confidence: 0.9 },
  // [시리즈명] Part 1, [시리즈명] Pt.1
  { regex: /^(.+?)\s*(?:Part|Pt\.?)\s*(\d+)\b/i, confidence: 0.9 },
  // [시리즈명] Episode 1, [시리즈명] Ep.1
  { regex: /^(.+?)\s*(?:Episode|Ep\.?)\s*(\d+)\b/i, confidence: 0.85 },
  // [시리즈명] #1
  { regex: /^(.+?)\s*#(\d+)\b/i, confidence: 0.85 },
  // [시리즈명] - 1, [시리즈명] -1
  { regex: /^(.+?)\s*-\s*(\d+)\b/i, confidence: 0.8 },
  // [시리즈명] (1), [시리즈명](1)
  { regex: /^(.+?)\s+\((\d+)\)\s*$/i, confidence: 0.8 },
  // [시리즈명] 01, [시리즈명] 001 (2-3자리 숫자)
  { regex: /^(.+?)\s+(\d{2,3})\b/i, confidence: 0.7 },
  // [시리즈명] 1 (한 자리 숫자)
  { regex: /^(.+?)\s+(\d)\b/i, confidence: 0.85 },
  // [시리즈명]1 (숫자가 단어에 붙은 경우) - 가장 마지막에 배치
  { regex: /^(.+?)(\d+)\b/i, confidence: 0.6 },
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
    // "시리즈명 상", "시리즈명 상권", "시리즈명 (상)", "시리즈명 상편" 패턴
    // 주의: \s+를 사용하여 "외전"의 "전"이 오탐지되지 않도록 공백 필수
    const pattern1 = new RegExp(`^(.+?)\\s+${order}\\s*$`);
    const pattern2 = new RegExp(`^(.+?)\\s+${order}권\\s*$`);
    const pattern3 = new RegExp(`^(.+?)\\s*\\(${order}\\)\\s*$`);
    const pattern4 = new RegExp(`^(.+?)\\s+${order}편\\s*$`);

    const match =
      title.match(pattern1) ||
      title.match(pattern2) ||
      title.match(pattern3) ||
      title.match(pattern4);
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

// 로그 샘플링을 위한 카운터 (성능 최적화)
let logCounter = 0;
const LOG_SAMPLE_RATE = 100; // 100개 중 1개만 로그 출력

/**
 * 제목에서 시리즈 패턴을 파싱
 */
export function parseTitlePattern(title: string): TitleParseResult {
  // 원본 제목 보존
  const originalTitle = title.trim();
  // 전처리: 전각→반각, 장식문자 제거, 공백 정리
  const trimmedTitle = preprocessTitle(originalTitle);

  // | 기호가 있으면 한글 부분 우선 파싱
  const titleToParse = extractKoreanTitle(trimmedTitle);

  // 로그 샘플링 (100개 중 1개만 출력)
  const shouldLog = ++logCounter % LOG_SAMPLE_RATE === 0;
  if (shouldLog && titleToParse !== trimmedTitle) {
    log.debug(`[시리즈 감지] 제목 추출: "${trimmedTitle}" → "${titleToParse}"`);
  }

  // 0. 특수기호 숫자 패턴 시도 (①, ②, ③ 등)
  const circledResult = extractCircledNumber(titleToParse);
  if (circledResult) {
    const result = {
      volumeNumber: circledResult.number,
      originalTitle: trimmedTitle,
      confidence: 0.95,
    };
    if (shouldLog) {
      log.debug(
        `[시리즈 감지] 파싱 결과 (특수기호): "${trimmedTitle}" → 권수: ${result.volumeNumber}`,
      );
    }
    return result;
  }

  // 0-1. 한글 순서 패턴 시도 (상/중/하, 전/후)
  const koreanOrderResult = extractKoreanOrder(titleToParse);
  if (koreanOrderResult) {
    const result = {
      volumeNumber: koreanOrderResult.number,
      originalTitle: trimmedTitle,
      confidence: 0.9,
    };
    if (shouldLog) {
      log.debug(
        `[시리즈 감지] 파싱 결과 (한글순서): "${trimmedTitle}" → 권수: ${result.volumeNumber}`,
      );
    }
    return result;
  }

  // 0-2. 외전/오마케 패턴 우선 시도
  // 주의: \b는 [a-zA-Z0-9_]만 인식하므로 한글 키워드에는 사용 불가
  for (const keyword of SPIN_OFF_KEYWORDS) {
    // 영문 키워드는 \b 사용, 한글 키워드는 공백/시작 기반 매칭
    const isEnglish = /^[a-zA-Z]/.test(keyword);
    const keywordSuffixRegex = isEnglish
      ? new RegExp(`(.+?)\\s*\\b${keyword}\\b$`, "i")
      : new RegExp(`(.+?)\\s+${keyword}\\s*$`);
    const match = titleToParse.match(keywordSuffixRegex);

    if (match) {
      const prefix = match[1].trim();
      if (prefix.length > 1) {
        const result = {
          volumeNumber: null,
          originalTitle: trimmedTitle,
          confidence: 0.7,
        };
        if (shouldLog) {
          log.debug(
            `[시리즈 감지] 파싱 결과 (외전): "${trimmedTitle}" → 신뢰도: ${result.confidence}`,
          );
        }
        return result;
      }
    }
  }

  // 1. 권수 패턴 시도
  for (const pattern of VOLUME_PATTERNS) {
    const match = titleToParse.match(pattern.regex);
    if (match) {
      const prefix = match[1].trim();
      const volumeNumber = parseInt(match[2], 10);

      if (prefix.length > 0 && volumeNumber > 0) {
        const result = {
          volumeNumber,
          originalTitle: trimmedTitle,
          confidence: pattern.confidence,
        };
        if (shouldLog) {
          log.debug(
            `[시리즈 감지] 파싱 결과 (권수패턴): "${trimmedTitle}" → 권수: ${result.volumeNumber}`,
          );
        }
        return result;
      }
    }
  }

  // 2. 패턴이 발견되지 않으면 낮은 신뢰도로 반환
  const result = {
    volumeNumber: null,
    originalTitle: trimmedTitle,
    confidence: 0.3, // 낮은 신뢰도
  };

  // 로그 샘플링 (100개 중 1개만 출력)
  if (shouldLog) {
    log.debug(
      `[시리즈 감지] 파싱 결과: "${trimmedTitle}" → 권수: ${result.volumeNumber}, 신뢰도: ${result.confidence}`,
    );
  }

  return result;
}

/**
 * 두 제목의 공통 접두어를 추출
 */
export function extractCommonPrefix(title1: string, title2: string): string {
  // 비교 전 전처리
  const normalized1 = preprocessTitle(title1);
  const normalized2 = preprocessTitle(title2);
  const len = Math.min(normalized1.length, normalized2.length);
  let commonLength = 0;

  for (let i = 0; i < len; i++) {
    if (normalized1[i] === normalized2[i]) {
      commonLength = i + 1;
    } else {
      break;
    }
  }

  // 단어 경계에서 자르기 (공백, 괄호, 하이픈 등)
  const prefix = normalized1.substring(0, commonLength);
  const boundaryMatch = new RegExp(/^(.+?)[\s\-([{「]?$/).exec(prefix);

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

/**
 * 비교 기반 그룹화를 위한 제목 비교 키
 */
export interface ComparisonKey {
  full: string;
  korean: string | null;
}

/**
 * Union-Find 자료구조
 * 비교 기반 그룹화에서 원소들을 병합하는 데 사용
 */
export class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }
  }

  getGroups(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < this.parent.length; i++) {
      const root = this.find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }
    return groups;
  }
}

/**
 * 제목을 비교용 키로 변환
 * | 기호가 있으면 한글 부분도 별도 추출
 */
export function computeComparisonKey(title: string): ComparisonKey {
  const full = preprocessTitle(title).toLowerCase();
  const pipeIndex = full.indexOf("|");
  if (pipeIndex !== -1) {
    const korean = full.substring(pipeIndex + 1).trim();
    return { full, korean: korean.length > 0 ? korean : null };
  }
  return { full, korean: null };
}

/**
 * 두 문자열의 LCP 길이 계산
 */
function lcpLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let lcp = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) lcp = i + 1;
    else break;
  }
  return lcp;
}

/**
 * 두 제목이 같은 시리즈인지 판정
 * full과 korean 중 더 유리한 쪽을 선택하여 규칙 적용
 */
export function shouldGroupTitles(
  key1: ComparisonKey,
  key2: ComparisonKey,
  vol1: number | null = null,
  vol2: number | null = null,
): boolean {
  const fullLCP = lcpLength(key1.full, key2.full);
  const koreanLCP =
    key1.korean && key2.korean ? lcpLength(key1.korean, key2.korean) : 0;

  // 더 긴 LCP를 가진 쌍(full 또는 korean)을 선택
  let bestLCP: number;
  let norm1: string;
  let norm2: string;
  let len1: number;
  let len2: number;

  if (koreanLCP > fullLCP) {
    // korean 기준이 더 유리
    bestLCP = koreanLCP;
    norm1 = key1.korean!;
    norm2 = key2.korean!;
    len1 = norm1.length;
    len2 = norm2.length;
  } else {
    // full 기준 사용
    bestLCP = fullLCP;
    norm1 = key1.full;
    norm2 = key2.full;
    len1 = norm1.length;
    len2 = norm2.length;
  }

  // 규칙 1: 공통 접두사가 너무 짧음
  if (bestLCP < 3) return false;

  // 짧은 쪽 대비 LCP 비율 계산 (이후 규칙에서 사용)
  const shorterLen = Math.min(len1, len2);
  const lcpRatio = bestLCP / shorterLen;

  // 규칙 2: 한쪽이 다른 쪽의 접두사
  if (len1 === bestLCP || len2 === bestLCP) {
    return true;
  }

  const suffix1 = norm1.substring(bestLCP);
  const suffix2 = norm2.substring(bestLCP);
  const stripped1 = suffix1.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
  const stripped2 = suffix2.replace(/\d+/g, "").replace(/\s+/g, " ").trim();

  // 규칙 3: 숫자 제거 후 접미사 동일 (LCP 비율이 충분히 높은 경우만)
  if (stripped1 === stripped2 && lcpRatio >= 0.8) return true;

  // 규칙 4: 둘 다 권수 있고 LCP ≥ 짧은 쪽의 75%
  if (vol1 !== null && vol2 !== null) {
    if (lcpRatio >= 0.75) return true;
  }

  // 규칙 5: 한쪽에만 숫자가 삽입된 경우 (비슷한 긴 제목)
  // 숫자와 추가 공백을 제거한 전체 문자열이 충분히 유사하면 같은 그룹
  // 짧은 제목은 오탐지 위험이 높으므로 최소 길이 조건 적용
  if (bestLCP >= 3 && shorterLen >= 5) {
    const fullStripped1 = norm1.replace(/\d+/g, "").replace(/\s+/g, " ");
    const fullStripped2 = norm2.replace(/\d+/g, "").replace(/\s+/g, " ");
    const strippedLCP = lcpLength(fullStripped1, fullStripped2);
    const shorterStripped = Math.min(
      fullStripped1.length,
      fullStripped2.length,
    );
    if (shorterStripped > 0 && strippedLCP / shorterStripped >= 0.8) {
      return true;
    }
  }

  // 규칙 6: 외전/오마케 키워드가 접미사에 포함된 경우
  // 공통 접두사 이후 접미사가 알려진 spin-off 키워드면 같은 그룹
  const lowerSuffix1 = suffix1.toLowerCase().trim();
  const lowerSuffix2 = suffix2.toLowerCase().trim();
  const isSpinOff1 = SPIN_OFF_KEYWORDS.some(
    (kw) => lowerSuffix1 === kw || lowerSuffix1.endsWith(" " + kw),
  );
  const isSpinOff2 = SPIN_OFF_KEYWORDS.some(
    (kw) => lowerSuffix2 === kw || lowerSuffix2.endsWith(" " + kw),
  );
  if ((isSpinOff1 || isSpinOff2) && bestLCP >= 3) {
    return true;
  }

  return false;
}
