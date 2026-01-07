import type { Knex } from "knex";

// 앱 사용 시간 로그 테이블 생성 마이그레이션
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("AppUsageLog", (table) => {
    table.increments("id").primary(); // Primary Key
    table.timestamp("started_at").notNullable(); // 앱 시작 시간
    table.timestamp("ended_at").nullable(); // 앱 종료 시간 (null = 아직 실행 중)
    table.integer("duration").nullable(); // 사용 시간 (초 단위, ended_at - started_at)
  });

  // 인덱스 추가 (날짜별 조회 최적화)
  await knex.schema.table("AppUsageLog", (table) => {
    table.index("started_at");
  });
}

// 테이블 롤백
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("AppUsageLog");
}
