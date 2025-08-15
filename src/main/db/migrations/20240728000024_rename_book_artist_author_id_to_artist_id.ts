import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("BookArtist", (table) => {
    table.renameColumn("author_id", "artist_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("BookArtist", (table) => {
    table.renameColumn("artist_id", "author_id");
  });
}
