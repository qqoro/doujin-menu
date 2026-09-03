import { Knex } from "knex";

/**
 * 사용자가 매기는 5점 척도 별점 컬럼 추가.
 *
 * 0은 "미평가"를 뜻한다. nullable로 두면 정렬·집계·비교마다 null 분기가 붙는데,
 * 0과 미평가를 구분해서 얻는 이득이 없어 기본값 0으로 고정한다.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.integer("rating").notNullable().defaultTo(0);
    table.index("rating", "idx_book_rating");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.dropIndex("rating", "idx_book_rating");
    table.dropColumn("rating");
  });
}
