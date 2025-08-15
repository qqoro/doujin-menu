import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("BookAuthor", (table) => {
    table.increments("id").primary();
    table
      .integer("book_id")
      .unsigned()
      .references("id")
      .inTable("Book")
      .onDelete("CASCADE");
    table
      .integer("author_id")
      .unsigned()
      .references("id")
      .inTable("Author")
      .onDelete("CASCADE");
    table.string("role"); // e.g., 'writer', 'artist'
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("BookAuthor");
}
