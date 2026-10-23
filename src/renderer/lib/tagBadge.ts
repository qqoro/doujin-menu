/**
 * 태그 뱃지의 표시 이름·검색어·색.
 *
 * 태그는 두 모양으로 들어온다. 라이브러리 DB는 성별 태그만 접두어를 붙여
 * 밑줄로 저장하고("female:solo_girl", "full_color"), 히토미 갤러리는 타입과
 * 띄어쓰기 이름을 따로 준다({ type: "female", name: "solo girl" }). 화면마다
 * 이 둘을 따로 다루면 같은 태그가 `solo_girl` / `solo girl` / `female:solo_girl`로
 * 갈라지므로, 전부 여기서 하나의 모양으로 맞춘다.
 */

export type TagKind = "female" | "male" | "tag";

export interface TagParts {
  kind: TagKind;
  /** 접두어 없는 밑줄 이름 */
  name: string;
}

export type TagSource = string | { type: string; name: string };

/** 뱃지를 얹는 바탕. `scrim`은 표지 위 어두운 그라디언트다 */
export type TagSurface = "card" | "scrim";

const toKind = (prefix: string): TagKind | null =>
  prefix === "female" || prefix === "male" || prefix === "tag" ? prefix : null;

/**
 * 어느 모양으로 들어온 태그든 종류와 밑줄 이름으로 나눈다.
 *
 * 문자열의 `tag:` 접두어도 떼어낸다. DB 태그 이름에는 없지만 차단 태그 항목은
 * "tag:netorare"처럼 저장된다. 그 밖의 접두어(artist: 등)는 태그 종류가 아니라서
 * 이름에 그대로 남긴다.
 */
export const toTagParts = (tag: TagSource): TagParts => {
  if (typeof tag !== "string") {
    return {
      kind: toKind(tag.type) ?? "tag",
      name: tag.name.replaceAll(" ", "_"),
    };
  }

  const colonAt = tag.indexOf(":");
  const kind = colonAt === -1 ? null : toKind(tag.slice(0, colonAt));
  return kind
    ? { kind, name: tag.slice(colonAt + 1) }
    : { kind: "tag", name: tag };
};

/**
 * 클릭 복사·검색에 쓰는 전체 검색어. 일반 태그도 `tag:`를 붙인다 — 접두어 없는
 * 단어는 제목 검색으로 들어간다.
 */
export const tagSearchTerm = (tag: TagSource): string => {
  const { kind, name } = toTagParts(tag);
  return `${kind}:${name}`;
};

const TONE: Record<TagSurface, Record<TagKind, string>> = {
  card: {
    female:
      "bg-pink-100 text-pink-800 dark:bg-pink-800 dark:text-pink-100 hover:bg-pink-200 dark:hover:bg-pink-700",
    male: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700",
    tag: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700",
  },
  // 같은 불투명 색을 표지 위에 얹으면 칩이 표지를 가리는 판처럼 보여서,
  // 색조만 남기고 반투명으로 깐다
  scrim: {
    female: "bg-pink-400/45 text-pink-50 hover:bg-pink-400/65",
    male: "bg-sky-400/45 text-sky-50 hover:bg-sky-400/65",
    tag: "bg-white/25 text-white hover:bg-white/40",
  },
};

export const tagTone = (kind: TagKind, surface: TagSurface = "card"): string =>
  TONE[surface][kind];
