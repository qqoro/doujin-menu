import type { Knex } from "knex";

// 새로운 BookHistory 테이블 생성 마이그레이션
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("BookHistory", (table) => {
    table.increments("id").primary(); // Primary Key
    table
      .integer("book_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("Book")
      .onDelete("CASCADE"); // 책이 삭제되면 히스토리도 삭제
    table.timestamp("viewed_at").defaultTo(knex.fn.now()); // 조회 시간
  });
}

// 테이블 롤백
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("BookHistory");
}
