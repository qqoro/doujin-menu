import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("BookTag", (table) => {
    table.increments("id").primary();
    table
      .integer("book_id")
      .unsigned()
      .references("id")
      .inTable("Book")
      .onDelete("CASCADE");
    table
      .integer("tag_id")
      .unsigned()
      .references("id")
      .inTable("Tag")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("BookTag");
}
