import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.string("hitomi_id").nullable();
    table.text("title_japanese").nullable();
    table.text("type").nullable(); // doujinshi, manga, artistcg, gamecg, anime
    table.text("language_name_english").nullable();
    table.text("language_name_local").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.dropColumn("hitomi_id");
    table.dropColumn("title_japanese");
    table.dropColumn("type");
    table.dropColumn("language_name_english");
    table.dropColumn("language_name_local");
  });
}
