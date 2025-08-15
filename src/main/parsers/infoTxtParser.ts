export interface ParsedMetadata {
  hitomi_id?: string;
  title?: string;
  artists?: { name: string }[];
  groups?: { name: string }[];
  type?: string;
  series?: { name: string }[];
  characters?: { name: string }[];
  tags?: { name: string }[];
  language?: string;
}

/**
 * info.txt 파일의 내용을 파싱하여 책의 메타데이터를 추출합니다.
 *
 * @param content info.txt 파일의 내용
 * @returns 파싱된 메타데이터 객체
 */
export function parseInfoTxt(content: string) {
  const metadata: ParsedMetadata = {};
  const lines = content.split("\n").filter((line) => line.trim() !== "");

  const keyMap = {
    "갤러리 넘버": "hitomi_id",
    제목: "title",
    작가: "artists",
    그룹: "groups",
    타입: "type",
    시리즈: "series",
    캐릭터: "characters",
    태그: "tags",
    언어: "language",
  } as const;

  lines.forEach((line) => {
    const parts = line.split(":");
    if (parts.length < 2) return;
    const key = parts[0].trim();
    const value = parts.slice(1).join(":").trim();

    const mappedKey = keyMap[key as keyof typeof keyMap];
    if (mappedKey) {
      // 작가, 태그, 시리즈, 캐릭터는 쉼표로 구분된 여러 값을 가질 수 있습니다.
      if (
        ["artists", "tags", "series", "characters", "groups"].includes(
          mappedKey,
        )
      ) {
        (metadata[mappedKey] as { name: string }[]) = value
          .split(",")
          .map((item) => ({ name: item.trim().replace(/\s+/g, "_") }));
      } else {
        // 그 외의 값들은 단일 값으로 처리합니다.
        (metadata[mappedKey] as string) = value;
      }
    }
  });

  return metadata as ParsedMetadata;
}
