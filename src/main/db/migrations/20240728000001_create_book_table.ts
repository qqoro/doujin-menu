import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("Book", (table) => {
    table.increments("id").primary();
    table.string("title").notNullable();
    table.integer("volume");
    table.string("path").notNullable().unique();
    table.string("cover_path");
    table.integer("page_count");
    table.dateTime("added_at").defaultTo(knex.fn.now());
    table.dateTime("last_read_at");
    table.integer("current_page").defaultTo(0);
    table.boolean("is_favorite").defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("Book");
}
