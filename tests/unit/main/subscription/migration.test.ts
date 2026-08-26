import type { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../src/main/db/test-utils.js";

describe("Subscription 테이블 마이그레이션", () => {
  let db: Knex;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("테이블이 생성된다", async () => {
    expect(await db.schema.hasTable("Subscription")).toBe(true);
  });

  it("필요한 컬럼이 모두 있다", async () => {
    const columns = [
      "id",
      "query",
      "normalized_query",
      "label",
      "enabled",
      "last_seen_id",
      "created_at",
      "last_checked_at",
    ];

    for (const column of columns) {
      expect(
        await db.schema.hasColumn("Subscription", column),
        `${column} 컬럼이 없습니다`,
      ).toBe(true);
    }
  });

  it("enabled 기본값은 true다", async () => {
    const [id] = await db("Subscription").insert({
      query: "artist:foo",
      normalized_query: "artist:foo",
    });

    const row = await db("Subscription").where("id", id).first();
    // SQLite는 boolean을 0/1로 저장한다
    expect(Boolean(row.enabled)).toBe(true);
  });

  it("last_seen_id는 비워둘 수 있다 (기준선 미설정)", async () => {
    const [id] = await db("Subscription").insert({
      query: "artist:foo",
      normalized_query: "artist:foo",
    });

    const row = await db("Subscription").where("id", id).first();
    expect(row.last_seen_id).toBeNull();
  });

  it("created_at이 자동으로 채워진다", async () => {
    const [id] = await db("Subscription").insert({
      query: "artist:foo",
      normalized_query: "artist:foo",
    });

    const row = await db("Subscription").where("id", id).first();
    expect(row.created_at).toBeTruthy();
  });

  it("normalized_query가 같으면 중복 등록을 막는다", async () => {
    await db("Subscription").insert({
      query: "artist:a tag:b",
      normalized_query: "artist:a tag:b",
    });

    // 원문은 다르지만 정규화하면 같은 검색어
    await expect(
      db("Subscription").insert({
        query: "tag:b artist:a",
        normalized_query: "artist:a tag:b",
      }),
    ).rejects.toThrow();
  });

  it("원문(query)이 같아도 정규화 키가 다르면 들어간다", async () => {
    await db("Subscription").insert({
      query: "artist:foo",
      normalized_query: "artist:foo",
    });

    await expect(
      db("Subscription").insert({
        query: "artist:foo",
        normalized_query: "artist:foo language:korean",
      }),
    ).resolves.toBeDefined();
  });
});
