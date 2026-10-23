import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Knex } from "knex";
import {
  createTestDb,
  seedBook,
  truncateAll,
} from "../../../src/main/db/test-utils";
import { whereUnderPath } from "../../../src/main/utils/libraryPath";

let db: Knex;

const pathsUnder = async (root: string) =>
  (await db("Book").where(whereUnderPath("path", root)).orderBy("path")).map(
    (row) => row.path,
  );

describe("whereUnderPath", () => {
  beforeAll(async () => {
    db = await createTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("하위 경로의 책을 고른다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a" });
    await seedBook(db, { path: "D:\\Comics\\sub\\b" });

    expect(await pathsUnder("D:\\Comics")).toEqual([
      "D:\\Comics\\a",
      "D:\\Comics\\sub\\b",
    ]);
  });

  it("루트와 같은 경로도 포함한다", async () => {
    await seedBook(db, { path: "D:\\Comics" });

    expect(await pathsUnder("D:\\Comics")).toEqual(["D:\\Comics"]);
  });

  it("이름 앞부분만 겹치는 이웃 폴더는 제외한다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a" });
    await seedBook(db, { path: "D:\\Comics2\\b" });
    await seedBook(db, { path: "D:\\Comics_old\\c" });

    expect(await pathsUnder("D:\\Comics")).toEqual(["D:\\Comics\\a"]);
  });

  it("루트의 _와 %를 와일드카드가 아닌 글자로 비교한다", async () => {
    await seedBook(db, { path: "D:\\my_comics\\a" });
    await seedBook(db, { path: "D:\\myXcomics\\b" });
    await seedBook(db, { path: "D:\\100%\\c" });
    await seedBook(db, { path: "D:\\100X\\d" });

    expect(await pathsUnder("D:\\my_comics")).toEqual(["D:\\my_comics\\a"]);
    expect(await pathsUnder("D:\\100%")).toEqual(["D:\\100%\\c"]);
  });

  it("영문 대소문자는 구분하지 않는다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a" });

    expect(await pathsUnder("d:\\comics")).toEqual(["D:\\Comics\\a"]);
  });

  it("끝에 \\가 붙은 루트도 같은 결과를 낸다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a" });
    await seedBook(db, { path: "D:\\Comics2\\b" });

    expect(await pathsUnder("D:\\Comics\\")).toEqual(["D:\\Comics\\a"]);
  });

  it("드라이브 루트 아래의 책을 모두 고른다", async () => {
    await seedBook(db, { path: "D:\\a" });
    await seedBook(db, { path: "D:\\Comics\\b" });
    await seedBook(db, { path: "E:\\c" });

    expect(await pathsUnder("D:\\")).toEqual(["D:\\Comics\\b", "D:\\a"]);
  });

  it("/와 \\가 섞여 있어도 같은 경로로 본다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a" });
    await seedBook(db, { path: "D:/Comics/b" });
    await seedBook(db, { path: "D:/Comics2/c" });

    expect(await pathsUnder("D:/Comics")).toEqual([
      "D:/Comics/b",
      "D:\\Comics\\a",
    ]);
  });

  it("한글과 이모지가 섞인 루트도 경계를 지킨다", async () => {
    await seedBook(db, { path: "D:\\만화😀\\a" });
    await seedBook(db, { path: "D:\\만화😀2\\b" });

    expect(await pathsUnder("D:\\만화😀")).toEqual(["D:\\만화😀\\a"]);
  });

  it("다른 조건과 AND로 묶인다", async () => {
    await seedBook(db, { path: "D:\\Comics\\a", is_offline: true });
    await seedBook(db, { path: "D:\\Comics\\b" });
    await seedBook(db, { path: "D:\\Other\\c", is_offline: true });

    const rows = await db("Book")
      .where(whereUnderPath("path", "D:\\Comics"))
      .where("is_offline", true);

    expect(rows.map((row) => row.path)).toEqual(["D:\\Comics\\a"]);
  });
});
