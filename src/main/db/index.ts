import { app } from "electron";
import { existsSync } from "fs";
import knex from "knex";
import { resolve } from "path";

const isDevelopment = process.env.NODE_ENV === "development";

const possiblePaths = [
  resolve(process.resourcesPath, "migrations"),
  resolve(import.meta.dirname, "migrations"),
  resolve(app.getAppPath(), "main", "migrations"),
];
const migrationsDirectory = isDevelopment
  ? resolve(import.meta.dirname, "./migrations")
  : possiblePaths.find((path) => existsSync(path)) || possiblePaths[0];

const db = knex({
  client: "better-sqlite3",
  connection: isDevelopment
    ? { filename: "./dev.sqlite3" }
    : { filename: resolve(app.getPath("userData"), "database.db") },
  useNullAsDefault: true,
  migrations: {
    tableName: "knex_migrations",
    extension: isDevelopment ? "ts" : "js",
    directory: migrationsDirectory,
    loadExtensions: [".js", ".ts"],
  },
});

db.raw("PRAGMA journal_mode = WAL;")
  .then(() => {
    console.log("SQLite WAL 모드가 활성화되었습니다.");
  })
  .catch((err) => {
    console.error("SQLite WAL 모드 활성화 실패:", err);
  });

await db.migrate.latest();

export default db;

export async function closeDbConnection() {
  if (db) {
    await db.raw(`PRAGMA wal_checkpoint(TRUNCATE);`);
    await db.destroy();
    console.log("[Main] Database connection closed.");
  }
}
