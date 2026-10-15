/**
 * 검색어 문자열에서 항목 하나를 켜고 끈다. 태그·작가·그룹·시리즈·캐릭터 칩
 * 클릭이 전부 같은 동작이다.
 *
 * 부분 문자열이 아니라 공백으로 끊은 토큰 단위로 비교한다. `includes`로 지우면
 * `tag:nurse`가 있는 상태에서 `tag:nurse2`를 누를 때 엉뚱한 쪽이 지워진다.
 */
export const toggleSearchTerm = (query: string, term: string): string => {
  const terms = query.split(" ").filter((s) => s !== "");
  const index = terms.indexOf(term);

  if (index > -1) {
    terms.splice(index, 1);
  } else {
    terms.push(term);
  }

  return terms.join(" ");
};

const SPACED_PREFIXES =
  "artist|group|series|character|tag|type|language|female|male";
const ANY_PREFIX =
  "id|artist|group|series|character|tag|type|language|female|male";

// 뒤따르는 낱말이 또 다른 프리픽스 항목이면 이름의 일부로 보지 않는다
const SPACED_TERM_REGEX = new RegExp(
  `(?:^|\\s)((${SPACED_PREFIXES}):(\\S+(?:\\s+(?!-?(?:${ANY_PREFIX}):)\\S+)+))\\s*$`,
  "i",
);

export interface SpacedPrefixTerm {
  /** 검색어에서 이 항목이 시작하는 위치 (제안으로 바꿔 끼울 범위의 시작) */
  start: number;
  /** `artist:` 처럼 콜론까지 포함한 소문자 프리픽스 */
  prefix: string;
  /** 공백을 `_`로 바꾼 소문자 이름. 저장된 이름과 같은 형태다 */
  key: string;
}

/**
 * 검색어 끝이 `artist:aa bb`처럼 공백 섞인 이름으로 끝나는지 찾는다.
 *
 * 저장된 이름은 info.txt를 읽을 때 공백이 `_`로 바뀌어 있어서(`aa_bb`),
 * 공백 그대로는 라이브러리 검색도 히토미 검색도 `artist:aa` + 제목 `bb`로
 * 갈라진다. 제안으로 `artist:aa_bb`를 띄우기 위한 판정이다.
 */
export const findSpacedPrefixTerm = (
  query: string,
): SpacedPrefixTerm | null => {
  const match = SPACED_TERM_REGEX.exec(query);
  if (!match) return null;

  const [whole, term, prefix, name] = match;
  return {
    start: match.index + whole.indexOf(term),
    prefix: `${prefix.toLowerCase()}:`,
    key: name.toLowerCase().split(/\s+/).join("_"),
  };
};
