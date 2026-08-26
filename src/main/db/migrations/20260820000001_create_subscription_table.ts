import type { Knex } from "knex";

/**
 * 구독 테이블 생성 마이그레이션
 * - 다운로더 검색어를 구독으로 저장
 * - 신작 판정용 워터마크(last_seen_id) 보관
 * - 신작 자체는 저장하지 않는다 (조회로 다시 나오는 정보라 쌓을 이유가 없다)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("Subscription", (table) => {
    table.increments("id").primary();
    table
      .text("query")
      .notNullable()
      .comment("원문 검색어. 화면 표시와 재조회에 쓴다");
    table
      .text("normalized_query")
      .notNullable()
      .comment(
        "중복 판정용 키. 공백 정리 후 낱말을 정렬한 값 (태그 순서만 다른 검색어를 한 칸으로 모은다)",
      );
    table.text("label").comment("표시용 이름. 비면 query를 그대로 보여준다");
    table
      .boolean("enabled")
      .notNullable()
      .defaultTo(true)
      .comment("꺼두면 폴링에서 빠지고 통합 피드에서도 제외된다");
    table
      .integer("last_seen_id")
      .comment(
        "확인한 최대 갤러리 ID. null이면 기준선 미설정 — 첫 폴링에서 채우고 그 회차는 신작 0건으로 친다",
      );
    table
      .dateTime("created_at")
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment("구독 등록 시간");
    table.dateTime("last_checked_at").comment("마지막으로 폴링에 성공한 시간");

    // 인덱스 생성
    table.unique("normalized_query", {
      indexName: "idx_subscription_normalized_query",
    });
    table.index("enabled", "idx_subscription_enabled");
  });

  console.log("[Migration] Subscription 테이블이 생성되었습니다.");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("Subscription");
  console.log("[Migration] Subscription 테이블이 삭제되었습니다.");
}
