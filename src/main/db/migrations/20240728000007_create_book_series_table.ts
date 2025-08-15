import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("BookSeries", (table) => {
    table.increments("id").primary();
    table
      .integer("book_id")
      .unsigned()
      .references("id")
      .inTable("Book")
      .onDelete("CASCADE");
    table
      .integer("series_id")
      .unsigned()
      .references("id")
      .inTable("Series")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("BookSeries");
}
