import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.renameTable("BookAuthor", "BookArtist");
  // Update foreign key constraints if necessary, though Knex usually handles this for simple renames.
  // For SQLite, renaming a table with foreign keys can be tricky. It's often better to drop and recreate.
  // However, for a simple rename, Knex's renameTable might suffice.
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.renameTable("BookArtist", "BookAuthor");
}
