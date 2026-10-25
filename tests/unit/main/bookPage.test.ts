import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const findBook = vi.fn();

vi.mock("../../../src/main/db/index.ts", () => ({
  default: () => ({
    where: () => ({ first: () => findBook() }),
  }),
  closeDbConnection: vi.fn(),
}));

import { serveBookPage } from "../../../src/main/utils/bookPage.js";

describe("serveBookPage", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "book-page-"));
    await fs.writeFile(path.join(dir, "1.jpg"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(dir, "2.png"), Buffer.from([4, 5, 6]));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    findBook.mockReset();
  });

  it("숫자가 아닌 bookId는 400", async () => {
    const res = await serveBookPage(NaN, 0);
    expect(res.status).toBe(400);
  });

  it("없는 책은 404", async () => {
    findBook.mockResolvedValue(undefined);
    const res = await serveBookPage(1, 0);
    expect(res.status).toBe(404);
  });

  it("폴더 책의 페이지를 이미지 타입과 함께 돌려준다", async () => {
    findBook.mockResolvedValue({ id: 1, path: dir });
    const res = await serveBookPage(1, 1);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([4, 5, 6]),
    );
  });

  it("범위를 벗어난 페이지는 404", async () => {
    findBook.mockResolvedValue({ id: 1, path: dir });
    const res = await serveBookPage(1, 5);
    expect(res.status).toBe(404);
  });
});
