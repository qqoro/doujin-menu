import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("presets", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("query").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("presets");
}
