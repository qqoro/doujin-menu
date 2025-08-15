import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("Character", (table) => {
    table.increments("id").primary();
    table.text("name").notNullable().unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("Character");
}
