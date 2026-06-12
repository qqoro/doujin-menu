import { Knex } from "knex";

/**
 * 외장하드 등 라이브러리 폴더 접근 불가 시 책을 삭제하지 않고
 * "오프라인" 상태로 보존하기 위한 컬럼 추가
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    // 오프라인 상태 플래그 (라이브러리 폴더 접근 불가 시 true)
    table.boolean("is_offline").notNullable().defaultTo(false);
    // 오프라인 필터링용 인덱스
    table.index("is_offline", "idx_book_is_offline");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.dropIndex("is_offline", "idx_book_is_offline");
    table.dropColumn("is_offline");
  });
}
