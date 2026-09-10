import type { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../src/main/db/test-utils.js";

let db: Knex;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

const insertQueueRow = (row: Record<string, unknown>) =>
  db("DownloadQueue").insert({
    gallery_title: "제목",
    download_path: "C:/다운로드",
    status: "pending",
    added_at: new Date().toISOString(),
    ...row,
  });

describe("DownloadQueue 소스 구분 마이그레이션", () => {
  it("기존 히토미 행을 source/source_key로 옮긴다", async () => {
    // 마지막 마이그레이션을 되돌려 옛 스키마로 만든 뒤, 그때의 행을 넣고 다시 올립니다.
    await db.migrate.down();
    await insertQueueRow({ gallery_id: 3241234 });
    await db.migrate.up();

    const row = await db("DownloadQueue").where("gallery_id", 3241234).first();
    expect(row.source).toBe("hitomi");
    expect(row.source_key).toBe("3241234");
  });

  it("소스가 같고 키가 같으면 두 번 들어가지 않는다", async () => {
    await insertQueueRow({ gallery_id: 123, source_key: "123" });

    await expect(
      insertQueueRow({ gallery_id: 123, source_key: "123" }),
    ).rejects.toThrow();
  });

  it("source를 적지 않으면 hitomi로 들어간다", async () => {
    await insertQueueRow({ gallery_id: 777, source_key: "777" });

    const row = await db("DownloadQueue").where("gallery_id", 777).first();
    expect(row.source).toBe("hitomi");
  });
});
