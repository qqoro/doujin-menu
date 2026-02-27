import { Knex } from "knex";

/**
 * 연결 테이블 성능 개선을 위한 인덱스 추가
 * 만 권 이상 규모에서 JOIN 쿼리 성능 향상
 */
export async function up(knex: Knex): Promise<void> {
  // BookTag 테이블 인덱스
  await knex.schema.alterTable("BookTag", (table) => {
    table.index("book_id", "idx_book_tag_book_id");
    table.index("tag_id", "idx_book_tag_tag_id");
  });

  // BookArtist 테이블 인덱스
  await knex.schema.alterTable("BookArtist", (table) => {
    table.index("book_id", "idx_book_artist_book_id");
    table.index("artist_id", "idx_book_artist_artist_id");
  });

  // BookSeries 테이블 인덱스
  await knex.schema.alterTable("BookSeries", (table) => {
    table.index("book_id", "idx_book_series_book_id");
    table.index("series_id", "idx_book_series_series_id");
  });

  // BookHistory 테이블 인덱스
  await knex.schema.alterTable("BookHistory", (table) => {
    table.index("book_id", "idx_book_history_book_id");
    table.index("viewed_at", "idx_book_history_viewed_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  // BookTag 테이블 인덱스 제거
  await knex.schema.alterTable("BookTag", (table) => {
    table.dropIndex("book_id", "idx_book_tag_book_id");
    table.dropIndex("tag_id", "idx_book_tag_tag_id");
  });

  // BookArtist 테이블 인덱스 제거
  await knex.schema.alterTable("BookArtist", (table) => {
    table.dropIndex("book_id", "idx_book_artist_book_id");
    table.dropIndex("artist_id", "idx_book_artist_artist_id");
  });

  // BookSeries 테이블 인덱스 제거
  await knex.schema.alterTable("BookSeries", (table) => {
    table.dropIndex("book_id", "idx_book_series_book_id");
    table.dropIndex("series_id", "idx_book_series_series_id");
  });

  // BookHistory 테이블 인덱스 제거
  await knex.schema.alterTable("BookHistory", (table) => {
    table.dropIndex("book_id", "idx_book_history_book_id");
    table.dropIndex("viewed_at", "idx_book_history_viewed_at");
  });
}
