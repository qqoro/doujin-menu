/**
 * 정보 수정 창의 이름 목록 칸(작가·태그 등). 검색창처럼 띄어쓰기로 구분한다.
 *
 * DB의 이름에는 공백이 없다 — info.txt를 읽을 때 파서가 `_`로 바꿔 저장한다.
 * 그래서 띄어쓰기를 구분자로 써도 이름이 쪼개지지 않고, 저장할 때 쉼표로 이어
 * 쓰면 파일 형식과 맞는다.
 */

export interface NameToken {
  start: number;
  end: number;
  query: string;
}

/**
 * 태그 칸에 `tag:full_color`처럼 검색어 모양으로 넣어도 같은 태그가 되게 한다.
 * `female:`·`male:`은 DB 이름의 일부라 그대로 둔다.
 */
const stripTagPrefix = (name: string) =>
  name.toLowerCase().startsWith("tag:") ? name.slice(4) : name;

/** 중복은 처음 것만 남긴다 */
export const parseNameList = (
  text: string,
  options: { tag?: boolean } = {},
): string[] => {
  const names = text.split(/\s+/).filter(Boolean);
  return [...new Set(options.tag ? names.map(stripTagPrefix) : names)].filter(
    Boolean,
  );
};

export const joinNameList = (names: string[]) => names.join(" ");

/** 커서가 놓인 단어. 공백 위에 있으면 빈 단어다 */
export const tokenAt = (text: string, caret: number): NameToken => {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { start, end, query: text.slice(start, end) };
};

/** 커서가 놓인 단어를 바꾼다. 끝에 넣었으면 다음 단어를 바로 칠 수 있게 공백을 붙인다 */
export const replaceToken = (
  text: string,
  token: NameToken,
  value: string,
): { text: string; caret: number } => {
  const before = text.slice(0, token.start);
  const after = text.slice(token.end);
  const tail = after.length === 0 ? " " : after;
  return {
    text: before + value + tail,
    caret: before.length + value.length + 1,
  };
};

/** 뱃지의 ×. 텍스트가 원본이라 텍스트에서 지운다 */
export const removeNameAt = (
  text: string,
  index: number,
  options: { tag?: boolean } = {},
): string => {
  const names = parseNameList(text, options);
  names.splice(index, 1);
  return joinNameList(names);
};

/**
 * 자동완성 후보. 앞부분이 맞는 이름을 먼저, 그다음 중간에 들어 있는 이름.
 * 이미 들어 있거나 친 그대로인 이름은 뺀다.
 */
export const suggestNames = (
  pool: readonly string[],
  query: string,
  used: readonly string[],
  limit = 8,
): string[] => {
  const q = stripTagPrefix(query).toLowerCase();
  if (!q) return [];
  const usedSet = new Set(used);
  const prefix: string[] = [];
  const middle: string[] = [];
  for (const name of pool) {
    if (usedSet.has(name)) continue;
    const lower = name.toLowerCase();
    if (lower === q) continue;
    // female:glasses는 glasses로도 찾는다
    const bare = lower.slice(lower.indexOf(":") + 1);
    if (lower.startsWith(q) || bare.startsWith(q)) prefix.push(name);
    else if (lower.includes(q)) middle.push(name);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...middle].slice(0, limit);
};

export const isValidGalleryId = (value: string) =>
  value.trim() === "" || /^\d+$/.test(value.trim());
