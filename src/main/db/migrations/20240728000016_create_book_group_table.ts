import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("BookGroup", (table) => {
    table
      .integer("book_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("Book")
      .onDelete("CASCADE");
    table
      .integer("group_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("Group")
      .onDelete("CASCADE");
    table.primary(["book_id", "group_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("BookGroup");
}
