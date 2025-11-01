import type { Knex } from "knex";

/**
 * 다운로드 큐 테이블 생성 마이그레이션
 * - 갤러리 다운로드 큐 관리
 * - 다운로드 진행 상태 추적
 * - 다운로드 속도 및 통계 저장
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("DownloadQueue", (table) => {
    table.increments("id").primary();
    table.integer("gallery_id").notNullable().unique();
    table.text("gallery_title").notNullable();
    table.text("gallery_artist");
    table.text("thumbnail_url");
    table.text("download_path").notNullable();
    table
      .text("status")
      .notNullable()
      .defaultTo("pending")
      .comment(
        "pending, downloading, completed, failed, paused 중 하나",
      );
    table.integer("progress").defaultTo(0).comment("진행률 0-100");
    table.integer("total_files").defaultTo(0).comment("전체 파일 개수");
    table
      .integer("downloaded_files")
      .defaultTo(0)
      .comment("다운로드 완료된 파일 개수");
    table
      .integer("download_speed")
      .defaultTo(0)
      .comment("다운로드 속도 (bytes/sec)");
    table.text("error_message").comment("실패 시 에러 메시지");
    table
      .dateTime("added_at")
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment("큐에 추가된 시간");
    table.dateTime("started_at").comment("다운로드 시작 시간");
    table.dateTime("completed_at").comment("다운로드 완료 시간");
    table
      .integer("priority")
      .defaultTo(0)
      .comment("우선순위 (추후 확장용, 높을수록 우선)");

    // 인덱스 생성
    table.index("gallery_id", "idx_download_queue_gallery_id");
    table.index("status", "idx_download_queue_status");
    table.index("added_at", "idx_download_queue_added_at");
  });

  console.log("[Migration] DownloadQueue 테이블이 생성되었습니다.");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("DownloadQueue");
  console.log("[Migration] DownloadQueue 테이블이 삭제되었습니다.");
}
