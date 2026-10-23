import type { Knex } from "knex";

/**
 * column이 root 폴더 자체이거나 그 하위 경로인 행을 고르는 where 콜백.
 *
 * `LIKE 'root%'`는 `D:\Comics2`까지 잡고 root의 `_`·`%`를 와일드카드로 읽는다.
 * 그래서 와일드카드 없는 앞부분 비교(substr)로 경계를 `root\`에 맞춘다.
 * 길이는 SQL의 length()로 잰다 — JS length는 이모지를 2글자로 세어 어긋난다.
 * COLLATE NOCASE로 기존 LIKE처럼 ASCII 대소문자는 구분하지 않는다.
 */
export function whereUnderPath(column: string, root: string) {
  const trimmed = root.replaceAll("/", "\\").replace(/\\+$/, "");
  const prefix = `${trimmed}\\`;

  return (builder: Knex.QueryBuilder) => {
    builder
      .whereRaw(`replace(??, '/', '\\') = ? COLLATE NOCASE`, [column, trimmed])
      .orWhereRaw(
        `substr(replace(??, '/', '\\'), 1, length(?)) = ? COLLATE NOCASE`,
        [column, prefix, prefix],
      );
  };
}
