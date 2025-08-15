import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("BookCharacter", (table) => {
    table
      .integer("book_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("Book")
      .onDelete("CASCADE");
    table
      .integer("character_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("Character")
      .onDelete("CASCADE");
    table.primary(["book_id", "character_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("BookCharacter");
}
