import type { BookInfoFields } from "../../types/ipc.js";
import type { ParsedMetadata } from "./infoTxtParser.js";

const EMPTY = "N/A";

const list = (names: string[]) => names.join(", ") || EMPTY;

/** 줄 단위로 파싱되므로 값 안의 줄바꿈은 다음 항목을 깨뜨린다 */
const oneLine = (value: string | null | undefined) =>
  (value ?? "").replace(/[\r\n]+/g, " ").trim();

/**
 * Hitomi-Downloader 형식의 info.txt 텍스트.
 *
 * 다운로드·일괄 생성·정보 수정이 모두 이 함수로 쓴다. `infoTxtParser`가 다시
 * 읽으므로 항목 이름과 줄 간격을 바꾸면 파서도 함께 봐야 한다.
 */
export const formatInfoContent = (fields: BookInfoFields): string =>
  [
    `갤러리 넘버: ${oneLine(fields.hitomi_id) || EMPTY}`,
    `제목: ${oneLine(fields.title)}`,
    `작가: ${list(fields.artists)}`,
    `그룹: ${list(fields.groups)}`,
    `타입: ${oneLine(fields.type) || EMPTY}`,
    `시리즈: ${list(fields.series)}`,
    `캐릭터: ${list(fields.characters)}`,
    `태그: ${list(fields.tags)}`,
    `언어: ${oneLine(fields.language) || EMPTY}`,
  ].join("\n\n");

const value = (raw: string | undefined) =>
  raw === undefined || raw === EMPTY || raw === "" ? null : raw;

const names = (items: { name: string }[] | undefined) =>
  (items ?? []).map((item) => item.name).filter((name) => value(name) !== null);

/** 파서 결과를 수정 창이 다루는 모양으로 바꾼다. `N/A`는 빈 값이다 */
export const toInfoFields = (parsed: ParsedMetadata): BookInfoFields => ({
  hitomi_id: value(parsed.hitomi_id),
  title: value(parsed.title) ?? "",
  artists: names(parsed.artists),
  groups: names(parsed.groups),
  type: value(parsed.type),
  series: names(parsed.series),
  characters: names(parsed.characters),
  tags: names(parsed.tags),
  language: value(parsed.language),
});
