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
    // 이 마이그레이션만 되돌려 옛 스키마로 만든 뒤, 그때의 행을 넣고 다시 올립니다.
    // 이름을 지정하지 않으면 뒤에 마이그레이션이 추가되는 순간 다른 것을 되돌립니다.
    const name = "20260904000001_add_download_queue_source.ts";
    await db.migrate.down({ name });
    await insertQueueRow({ gallery_id: 3241234 });
    await db.migrate.up({ name });

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
