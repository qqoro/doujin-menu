import { Knex } from "knex";

/**
 * SeriesCollection 테이블 생성
 * 자동 시리즈 감지를 통해 생성된 시리즈 그룹을 관리
 * 기존 Series 테이블(패러디 원본용)과는 완전히 독립적인 구조
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("SeriesCollection", (table) => {
    table.increments("id").primary();
    // 시리즈명 (자동 감지로 생성된 기본 이름, 사용자가 수정 가능)
    table.string("name").notNullable();
    // 시리즈 설명 (선택사항)
    table.text("description").nullable();
    // 시리즈 대표 이미지 경로 (선택사항)
    table.string("cover_image").nullable();
    // 자동 생성 여부 (자동 감지로 생성되었는지 여부)
    table.boolean("is_auto_generated").defaultTo(true);
    // 사용자가 수동 수정했는지 여부 (수동 수정 시 자동 감지에서 제외)
    table.boolean("is_manually_edited").defaultTo(false);
    // 자동 감지 신뢰도 (0.0 ~ 1.0, 높을수록 확실한 패턴)
    table.decimal("confidence_score", 3, 2).defaultTo(0.0);
    // 생성 일시
    table.dateTime("created_at").defaultTo(knex.fn.now());
    // 수정 일시
    table.dateTime("updated_at").defaultTo(knex.fn.now());
  });

  // Book 테이블에 시리즈 그룹 관련 컬럼 추가
  await knex.schema.table("Book", (table) => {
    // 시리즈 그룹 FK (0개 또는 1개의 시리즈에 속할 수 있음)
    table
      .integer("series_collection_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("SeriesCollection")
      .onDelete("SET NULL");
    // 시리즈 내 순서 (1부터 시작, null이면 순서 없음)
    table.integer("series_order_index").nullable();
  });

  // 인덱스 추가 (검색 성능 향상)
  await knex.schema.alterTable("Book", (table) => {
    table.index("series_collection_id");
    table.index(["series_collection_id", "series_order_index"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Book 테이블의 인덱스 제거
  await knex.schema.alterTable("Book", (table) => {
    table.dropIndex("series_collection_id");
    table.dropIndex(["series_collection_id", "series_order_index"]);
  });

  // Book 테이블의 컬럼 제거
  await knex.schema.table("Book", (table) => {
    table.dropColumn("series_collection_id");
    table.dropColumn("series_order_index");
  });

  // SeriesCollection 테이블 삭제
  await knex.schema.dropTable("SeriesCollection");
}
