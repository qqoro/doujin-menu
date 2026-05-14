import type { Knex } from "knex";
import knex from "knex";
import { readdirSync } from "fs";
import { resolve } from "path";

/**
 * vitest 환경에서 .ts 마이그레이션 파일을 로드하기 위한 커스텀 마이그레이션 소스.
 * Knex 기본 로더는 .ts 파일을 로드할 수 없으므로,
 * dynamic import()를 통해 vitest의 모듈 변환을 활용한다.
 */
class VitestMigrationSource implements Knex.MigrationSource<string> {
  private readonly migrationsDir: string;

  constructor(migrationsDir: string) {
    this.migrationsDir = migrationsDir;
  }

  getMigrations(): Promise<string[]> {
    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
      .sort();
    return Promise.resolve(files);
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  async getMigration(migration: string): Promise<{
    up: (knex: Knex) => Promise<void>;
    down: (knex: Knex) => Promise<void>;
  }> {
    const fullPath = resolve(this.migrationsDir, migration);
    const mod = await import(fullPath);
    return mod;
  }
}

/**
 * 인메모리 SQLite 테스트용 Knex 인스턴스를 생성한다.
 * 마이그레이션을 실행하여 모든 테이블을 생성한 뒤 인스턴스를 반환한다.
 */
export async function createTestDb(): Promise<Knex> {
  const migrationsDir = resolve(import.meta.dirname, "./migrations");

  const db = knex({
    client: "better-sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
    migrations: {
      migrationSource: new VitestMigrationSource(migrationsDir),
    },
  });

  // SQLite 외래키 활성화
  await db.raw("PRAGMA foreign_keys = ON");

  // 마이그레이션 실행 — 모든 테이블 생성
  await db.migrate.latest();

  return db;
}

/** 모든 테이블의 데이터를 삭제 (외래키 순서 고려) */
export async function truncateAll(db: Knex): Promise<void> {
  const tables = [
    "BookHistory",
    "BookCharacter",
    "BookGroup",
    "BookSeries",
    "BookTag",
    "BookArtist",
    "DownloadQueue",
    "AppUsageLog",
    "presets",
    "Book",
    "SeriesCollection",
    "Character",
    "Group",
    "Series",
    "Tag",
    "Artist",
  ];

  for (const table of tables) {
    await db(table).del();
  }
}

// ========== 시드 헬퍼 ==========

interface DbRow {
  id: number;
  [key: string]: unknown;
}

export async function seedBook(
  db: Knex,
  overrides: Record<string, unknown> = {},
): Promise<DbRow> {
  const defaults = {
    title: "Test Book",
    path: `/library/test-book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    is_favorite: false,
  };
  const data = { ...defaults, ...overrides };
  await db("Book").insert(data);
  return db("Book").where("path", data.path).first();
}

export async function seedArtist(db: Knex, name: string): Promise<DbRow> {
  const existing = await db("Artist").where("name", name).first();
  if (existing) return existing;
  const [id] = await db("Artist").insert({ name });
  return db("Artist").where("id", id).first();
}

export async function seedTag(db: Knex, name: string): Promise<DbRow> {
  const existing = await db("Tag").where("name", name).first();
  if (existing) return existing;
  const [id] = await db("Tag").insert({ name });
  return db("Tag").where("id", id).first();
}

export async function seedSeries(db: Knex, name: string): Promise<DbRow> {
  const existing = await db("Series").where("name", name).first();
  if (existing) return existing;
  const [id] = await db("Series").insert({ name });
  return db("Series").where("id", id).first();
}

export async function seedGroup(db: Knex, name: string): Promise<DbRow> {
  const existing = await db("Group").where("name", name).first();
  if (existing) return existing;
  const [id] = await db("Group").insert({ name });
  return db("Group").where("id", id).first();
}

export async function seedCharacter(db: Knex, name: string): Promise<DbRow> {
  const existing = await db("Character").where("name", name).first();
  if (existing) return existing;
  const [id] = await db("Character").insert({ name });
  return db("Character").where("id", id).first();
}

export async function linkBookArtist(
  db: Knex,
  bookId: number,
  artistId: number,
) {
  await db("BookArtist").insert({ book_id: bookId, artist_id: artistId });
}

export async function linkBookTag(db: Knex, bookId: number, tagId: number) {
  await db("BookTag").insert({ book_id: bookId, tag_id: tagId });
}

export async function linkBookSeries(
  db: Knex,
  bookId: number,
  seriesId: number,
) {
  await db("BookSeries").insert({ book_id: bookId, series_id: seriesId });
}

export async function linkBookGroup(db: Knex, bookId: number, groupId: number) {
  await db("BookGroup").insert({ book_id: bookId, group_id: groupId });
}

export async function linkBookCharacter(
  db: Knex,
  bookId: number,
  characterId: number,
) {
  await db("BookCharacter").insert({
    book_id: bookId,
    character_id: characterId,
  });
}
