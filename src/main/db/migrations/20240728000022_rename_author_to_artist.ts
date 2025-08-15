import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.renameTable("Author", "Artist");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.renameTable("Artist", "Author");
}
