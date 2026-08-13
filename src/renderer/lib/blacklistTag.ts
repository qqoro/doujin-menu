/**
 * 차단 태그 입력값 정규화·검증.
 *
 * 설정 화면(타입 셀렉터 + 이름 2필드)과 다운로더 헤더 팝오버(한 줄 입력)가
 * 같은 규칙을 써야 해서 여기로 모았습니다. 한쪽만 고치면 같은 문자열이
 * 화면에 따라 통과하기도 하고 거부되기도 하는 일이 생깁니다.
 */

/**
 * node-hitomi의 getParsedTags가 허용하는 타입 9종.
 *
 * parody는 없습니다. 라이브러리가 목록을 만들 때
 * ["parody","artist","group","character"].slice(1)로 첫 항목을 잘라내기
 * 때문입니다.
 */
export const BLACKLIST_TYPES = [
  "tag",
  "male",
  "female",
  "artist",
  "group",
  "character",
  "series",
  "type",
  "language",
] as const;

export type BlacklistType = (typeof BLACKLIST_TYPES)[number];

/** 히토미 태그 이름 규칙. getParsedTags와 같은 패턴입니다. */
const TAG_NAME_PATTERN = /^[a-z0-9][a-z0-9-_.]*$/;

/**
 * 입력값을 히토미 태그 이름 형식으로 정규화합니다.
 *
 * 공백 → 밑줄, 대문자 → 소문자. "big breasts"는 사용자가 가장 자연스럽게
 * 치는 형태인데 그대로 거부하면 무의미한 마찰이라 자동으로 고쳐줍니다.
 */
export const normalizeTagName = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, "_");

export type ParseResult =
  | { ok: true; entry: string }
  | { ok: false; error: string };

/**
 * 타입과 이름을 검증해 "type:name" 항목을 만듭니다.
 */
export const buildBlacklistEntry = (
  type: string,
  rawName: string,
): ParseResult => {
  const name = normalizeTagName(rawName);

  if (!name) {
    return { ok: false, error: "태그 이름을 입력해주세요." };
  }
  if (!TAG_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      error: "영문 소문자·숫자와 - _ . 만 쓸 수 있습니다. (한글 불가)",
    };
  }
  if (!(BLACKLIST_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: `쓸 수 없는 타입입니다: ${type}` };
  }

  return { ok: true, entry: `${type}:${name}` };
};

/**
 * "female:guro" 같은 한 줄 입력을 항목으로 바꿉니다.
 *
 * 콜론이 없으면 tag 타입으로 봅니다. 사용자가 가장 흔히 치는 형태가
 * 그냥 "yaoi"라서, 타입을 강제로 요구하기보다 기본값을 주는 쪽이 낫습니다.
 * 앞에 붙은 "-"는 검색 문법에서 복사해 온 경우를 위해 떼어냅니다.
 */
export const parseBlacklistInput = (raw: string): ParseResult => {
  const trimmed = raw.trim().replace(/^-/, "");

  if (!trimmed) {
    return { ok: false, error: "차단할 태그를 입력해주세요." };
  }

  const colonAt = trimmed.indexOf(":");
  if (colonAt === -1) {
    return buildBlacklistEntry("tag", trimmed);
  }

  const type = trimmed.slice(0, colonAt).trim().toLowerCase();
  const name = trimmed.slice(colonAt + 1);
  return buildBlacklistEntry(type, name);
};
