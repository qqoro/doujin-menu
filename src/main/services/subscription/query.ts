/**
 * 구독 검색어의 정규화·유효성 검사·태그 파싱.
 *
 * 다운로더 검색어 문법을 그대로 쓰되, 구독은 태그만 본다. 제목 단어는 무시한다.
 */
import type { Tag } from "node-hitomi";
import { parseTags } from "../hitomi/tags.js";

export interface ParsedSubscription {
  positive: Tag[];
  negative: Tag[];
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/** 공백으로 끊어 빈 항목을 버린다 */
const toTerms = (query: string): string[] =>
  query.trim().split(/\s+/).filter(Boolean);

/**
 * 중복 판정용 키를 만든다.
 *
 * downloaderHandler의 buildCacheKey와 같은 규칙이다 — 히토미 관점에서 동치인
 * 검색어(태그 순서·공백 차이)를 한 값으로 모은다.
 *
 * 소문자화하지 않는다. 태그 이름 규칙이 대문자를 거부하므로 artist:Foo는 실패하고
 * artist:foo는 성공하는데, 키를 소문자화하면 둘이 같은 칸을 쓰게 된다.
 */
export const normalizeQuery = (query: string): string =>
  toTerms(query).sort().join(" ");

/**
 * 구독으로 등록할 수 있는 검색어인지 본다.
 *
 * 핵심 조건은 **양성 태그 최소 하나**다. 비용 때문이 아니라 시작점 때문이다 —
 * 양성 태그가 있어야 그 태그의 nozomi 파일에서 출발해 교집합할 수 있다.
 * 제목 단어만 있거나 음성 태그만 있으면 출발할 집합이 없어 전체 인덱스가 필요해진다.
 */
export const validateSubscriptionQuery = (query: string): ValidationResult => {
  const terms = toTerms(query);

  if (terms.length === 0) {
    return { ok: false, reason: "구독할 검색어가 비어 있습니다." };
  }

  const positiveTagTerms = terms.filter(
    (term) => term.includes(":") && !term.startsWith("-"),
  );

  if (positiveTagTerms.length === 0) {
    return {
      ok: false,
      reason:
        "구독하려면 artist: 나 tag: 같은 태그가 하나 이상 필요합니다. 제목 단어만으로는 구독할 수 없습니다.",
    };
  }

  for (const term of positiveTagTerms) {
    try {
      parseTags(term);
    } catch {
      return {
        ok: false,
        reason: `태그 형식이 올바르지 않습니다: ${term} (소문자와 숫자, -_. 만 쓸 수 있습니다)`,
      };
    }
  }

  return { ok: true };
};

/**
 * 검색어와 차단 태그를 양성/음성 태그로 나눈다.
 *
 * 반드시 한 항목씩 파싱한다. 알 수 없는 태그 종류나 규칙에 맞지 않는 이름은
 * 예외가 되므로, 전부 join해 넘기면 손상된 항목 하나가 나머지까지 통째로 날린다.
 */
export const parseSubscriptionQuery = (
  query: string,
  blacklist: string[],
): ParsedSubscription => {
  const positive: Tag[] = [];
  const negative: Tag[] = [];
  const seen = new Set<string>();

  for (const term of toTerms(query)) {
    // 제목 단어는 구독 대상이 아니다
    if (!term.includes(":")) continue;

    try {
      const [tag] = parseTags(term);
      if (!tag) continue;

      seen.add(`${tag.type}:${tag.name}`);
      (tag.isNegative ? negative : positive).push(tag);
    } catch {
      // 유효성 검사를 통과한 검색어라면 여기 오지 않는다. 방어적으로 건너뛴다
      continue;
    }
  }

  for (const raw of blacklist) {
    try {
      const [tag] = parseTags(raw.startsWith("-") ? raw : `-${raw}`);
      if (!tag) continue;

      // 유저가 명시적으로 검색한 태그가 차단 태그를 이긴다
      const key = `${tag.type}:${tag.name}`;
      if (seen.has(key)) continue;

      seen.add(key);
      negative.push(tag);
    } catch {
      console.warn(`[Subscription] 차단 태그 파싱 실패, 건너뜁니다: ${raw}`);
    }
  }

  return { positive, negative };
};
