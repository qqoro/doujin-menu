import { Knex } from "knex";

/**
 * 압축 책 옆 파일(`<파일명>.info.txt`)의 수정 시간. 증분 스캔은 압축 파일이
 * 그대로여도 이 값이 바뀌면 다시 읽는다.
 *
 * `file_mtime`에 합치지 않는다. 그 값은 "파일 수정 날짜" 정렬에 쓰여서, 정보만
 * 고친 책이 최근 수정 목록 맨 위로 올라온다.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.bigInteger("info_mtime").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.dropColumn("info_mtime");
  });
}
