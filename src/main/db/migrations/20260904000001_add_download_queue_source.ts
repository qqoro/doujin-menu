import type { Knex } from "knex";

/**
 * DownloadQueue에 다운로드 소스 구분 추가
 * - source: 다운로드 소스 (현재는 히토미뿐)
 * - source_key: 소스별 원본 식별자 (히토미는 갤러리 ID를 문자열로 적음)
 * - 식별자를 문자열로 일반화하면서 gallery_id를 nullable로 완화하고
 *   단독 UNIQUE를 (source, source_key)로 옮김
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("DownloadQueue", (table) => {
    table
      .text("source")
      .notNullable()
      .defaultTo("hitomi")
      .comment("다운로드 소스");
    table.text("source_key").comment("소스별 원본 식별자");
  });

  // 기존 행은 전부 히토미입니다. gallery_id를 문자열 키로 옮깁니다.
  await knex("DownloadQueue")
    .whereNull("source_key")
    .update({ source_key: knex.raw("CAST(gallery_id AS TEXT)") });

  await knex.schema.alterTable("DownloadQueue", (table) => {
    table.dropUnique(["gallery_id"]);
    table.integer("gallery_id").nullable().alter();
  });

  await knex.schema.alterTable("DownloadQueue", (table) => {
    table.unique(["source", "source_key"], {
      indexName: "idx_download_queue_source_key",
    });
  });

  console.log("[Migration] DownloadQueue에 source/source_key가 추가되었습니다.");
}

export async function down(knex: Knex): Promise<void> {
  // 히토미가 아닌 항목은 gallery_id가 없어 옛 스키마로 돌아갈 수 없습니다.
  await knex("DownloadQueue").whereNot("source", "hitomi").del();

  await knex.schema.alterTable("DownloadQueue", (table) => {
    table.dropUnique(["source", "source_key"], "idx_download_queue_source_key");
  });

  await knex.schema.alterTable("DownloadQueue", (table) => {
    table.integer("gallery_id").notNullable().alter();
    table.unique(["gallery_id"]);
  });

  await knex.schema.alterTable("DownloadQueue", (table) => {
    table.dropColumn("source");
    table.dropColumn("source_key");
  });

  console.log("[Migration] DownloadQueue의 source/source_key가 제거되었습니다.");
}
