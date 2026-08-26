/**
 * 다운로더 검색과 구독이 공유하는 언어 선택지.
 *
 * 히토미는 언어를 별도 필드가 아니라 `language:korean` 태그로 다루므로 구독도
 * 언어를 컬럼으로 따로 두지 않고 검색어 문자열 안에 넣어 저장한다. 표시할 때만
 * `splitLanguage`로 떼어낸다.
 */

export interface LanguageOption {
  value: string;
  label: string;
}

/** 다운로더 필터와 구독 추가가 같이 쓰는 언어 목록. "all"은 언어를 안 붙인다 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "all", label: "전체 언어" },
  { value: "korean", label: "한국어" },
  { value: "japanese", label: "일본어" },
  { value: "english", label: "영어" },
  { value: "chinese", label: "중국어" },
];

/** 언어 값에 대응하는 한국어 이름. 모르는 값은 그대로 돌려준다 */
export const languageLabel = (value: string): string =>
  LANGUAGE_OPTIONS.find((option) => option.value === value)?.label ?? value;

/**
 * 검색어 앞에 언어 태그를 붙인다.
 *
 * 이미 `language:`를 직접 쓴 검색어는 그대로 둔다. 필터가 조용히 덮어쓰면
 * 무엇을 구독했는지 알 수 없게 된다.
 */
export const withLanguage = (language: string, query: string): string => {
  const trimmed = query.trim();

  if (!language || language === "all") return trimmed;
  if (splitLanguage(trimmed).language !== null) return trimmed;

  return trimmed ? `language:${language} ${trimmed}` : `language:${language}`;
};

/**
 * 검색어에서 언어 태그를 떼어낸다.
 *
 * 제외 조건(`-language:korean`)은 언어 선택이 아니라 검색 조건이므로 남긴다.
 */
export const splitLanguage = (
  query: string,
): { language: string | null; rest: string } => {
  const terms = query.trim().split(/\s+/).filter(Boolean);

  let language: string | null = null;
  const rest: string[] = [];

  for (const term of terms) {
    if (language === null && term.toLowerCase().startsWith("language:")) {
      const value = term.slice("language:".length);
      if (value) {
        language = value.toLowerCase();
        continue;
      }
    }
    rest.push(term);
  }

  return { language, rest: rest.join(" ") };
};
