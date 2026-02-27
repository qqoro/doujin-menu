import { Knex } from "knex";

/**
 * Book 테이블 성능 개선을 위한 인덱스 추가
 * 수만 권 규모에서 검색/정렬/필터링 속도 향상
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    // 정렬용 인덱스
    table.index("added_at", "idx_book_added_at");
    table.index("hitomi_id", "idx_book_hitomi_id");

    // 필터링용 인덱스
    table.index("is_favorite", "idx_book_is_favorite");
    table.index("last_read_at", "idx_book_last_read_at");
    table.index("type", "idx_book_type");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.dropIndex("added_at", "idx_book_added_at");
    table.dropIndex("hitomi_id", "idx_book_hitomi_id");
    table.dropIndex("is_favorite", "idx_book_is_favorite");
    table.dropIndex("last_read_at", "idx_book_last_read_at");
    table.dropIndex("type", "idx_book_type");
  });
}
