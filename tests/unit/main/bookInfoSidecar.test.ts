import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Knex } from "knex";
import { ZipArchive } from "archiver";
import * as fsSync from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createTestDb, truncateAll } from "../../../src/main/db/test-utils.js";

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock("../../../src/main/main.js", () => ({
  console: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../src/main/handlers/thumbnailHandler.js", () => ({
  generateThumbnailForBook: vi.fn(async () => null),
  handleGenerateThumbnail: vi.fn(async () => null),
}));

vi.mock("../../../src/main/handlers/seriesCollectionHandler.js", () => ({
  getPrefixIndex: vi.fn(() => ({})),
  rebuildPrefixIndex: vi.fn(async () => undefined),
  handleAutoDetectSeriesForBook: vi.fn(async () => ({ matched: false })),
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import {
  scanDirectory,
  scanFile,
} from "../../../src/main/handlers/directoryHandler.js";
import {
  handleGetBookInfoFile,
  handleSaveBookInfoFile,
} from "../../../src/main/handlers/bookInfoHandler.js";
import { formatInfoContent } from "../../../src/main/parsers/infoTxtFormat.js";
import type { BookInfoFields } from "../../../src/types/ipc.js";

let db: Knex;
let tempRoot: string;
let caseIndex = 0;

const fields = (overrides: Partial<BookInfoFields> = {}): BookInfoFields => ({
  hitomi_id: "100",
  title: "기본 제목",
  artists: ["artist_a"],
  groups: [],
  type: "manga",
  series: [],
  characters: [],
  tags: ["full_color"],
  language: "korean",
  ...overrides,
});

/** 이미지 1장과, 주어지면 info.txt가 든 ZIP */
async function createZip(zipPath: string, info?: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const output = fsSync.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 0 } });
    output.on("close", () => resolvePromise());
    archive.on("error", rejectPromise);
    archive.pipe(output);
    archive.append(Buffer.from("fake-image-bytes"), { name: "001.jpg" });
    if (info) archive.append(Buffer.from(info), { name: "info.txt" });
    archive.finalize();
  });
}

async function createFolderBook(folderPath: string, info?: string) {
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(folderPath, "001.jpg"), "fake-image-bytes");
  if (info) await fs.writeFile(path.join(folderPath, "info.txt"), info);
}

/** 테스트마다 새 라이브러리 폴더 */
async function newLibrary(): Promise<string> {
  const dir = path.join(tempRoot, `lib-${caseIndex++}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const bookAt = (bookPath: string) => db("Book").where("path", bookPath).first();

const tagNames = (bookId: number) =>
  db("BookTag")
    .join("Tag", "Tag.id", "BookTag.tag_id")
    .where("BookTag.book_id", bookId)
    .pluck("Tag.name");

describe("압축 책 옆 파일(info.txt)", () => {
  beforeAll(async () => {
    db = await createTestDb();
    dbRef.current = db;
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "info-sidecar-"));
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.destroy();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  describe("스캔 우선순위", () => {
    it("압축 안의 info.txt보다 옆 파일을 먼저 읽는다", async () => {
      const lib = await newLibrary();
      const zipPath = path.join(lib, "book.cbz");
      await createZip(zipPath, formatInfoContent(fields({ title: "압축 안" })));
      await fs.writeFile(
        `${zipPath}.info.txt`,
        formatInfoContent(fields({ title: "옆 파일" })),
      );

      await scanFile(zipPath);

      expect((await bookAt(zipPath)).title).toBe("옆 파일");
    });

    it("옆 파일이 없으면 압축 안의 info.txt를 읽는다", async () => {
      const lib = await newLibrary();
      const zipPath = path.join(lib, "book.cbz");
      await createZip(zipPath, formatInfoContent(fields({ title: "압축 안" })));

      await scanFile(zipPath);

      const book = await bookAt(zipPath);
      expect(book.title).toBe("압축 안");
      expect(book.info_mtime).toBeNull();
    });

    it("폴더 책은 폴더 안 info.txt가 옆 파일보다 먼저다", async () => {
      const lib = await newLibrary();
      const folder = path.join(lib, "folder-book");
      await createFolderBook(
        folder,
        formatInfoContent(fields({ title: "폴더 안" })),
      );
      await fs.writeFile(
        `${folder}.info.txt`,
        formatInfoContent(fields({ title: "옆 파일" })),
      );

      await scanFile(folder);

      expect((await bookAt(folder)).title).toBe("폴더 안");
    });
  });

  describe("증분 스캔", () => {
    it("압축 파일이 그대로여도 옆 파일이 새로 생기면 다시 읽는다", async () => {
      const lib = await newLibrary();
      const zipPath = path.join(lib, "book.cbz");
      await createZip(zipPath, formatInfoContent(fields({ title: "압축 안" })));
      await scanDirectory(lib);
      expect((await bookAt(zipPath)).title).toBe("압축 안");

      await fs.writeFile(
        `${zipPath}.info.txt`,
        formatInfoContent(fields({ title: "새 옆 파일" })),
      );
      await scanDirectory(lib);

      const book = await bookAt(zipPath);
      expect(book.title).toBe("새 옆 파일");
      const stat = await fs.stat(`${zipPath}.info.txt`);
      expect(book.info_mtime).toBe(stat.mtimeMs);
    });

    it("옆 파일을 고치면 다시 읽고, 지우면 압축 안으로 돌아간다", async () => {
      const lib = await newLibrary();
      const zipPath = path.join(lib, "book.cbz");
      const sidecar = `${zipPath}.info.txt`;
      await createZip(zipPath, formatInfoContent(fields({ title: "압축 안" })));
      await fs.writeFile(sidecar, formatInfoContent(fields({ title: "처음" })));
      await scanDirectory(lib);

      await fs.writeFile(sidecar, formatInfoContent(fields({ title: "고침" })));
      // 같은 밀리초 안에 쓰면 mtime이 그대로라 변경을 못 알아챈다
      const later = new Date(Date.now() + 5000);
      await fs.utimes(sidecar, later, later);
      await scanDirectory(lib);
      expect((await bookAt(zipPath)).title).toBe("고침");

      await fs.rm(sidecar);
      await scanDirectory(lib);
      const book = await bookAt(zipPath);
      expect(book.title).toBe("압축 안");
      expect(book.info_mtime).toBeNull();
    });

    it("압축 파일도 옆 파일도 그대로면 건너뛴다", async () => {
      const lib = await newLibrary();
      const zipPath = path.join(lib, "book.cbz");
      await createZip(zipPath, formatInfoContent(fields({ title: "압축 안" })));
      await scanDirectory(lib);

      // 건너뛰면 DB를 손으로 바꾼 값이 그대로 남는다
      await db("Book").where("path", zipPath).update({ title: "손으로 바꿈" });
      await scanDirectory(lib);

      expect((await bookAt(zipPath)).title).toBe("손으로 바꿈");
    });
  });

  describe("handleGetBookInfoFile", () => {
    it("압축 안 info만 있는 책은 그 내용을 주고 저장 위치는 옆 파일이다", async () => {
      const lib = await newLibrary();
      const zipPath = path.join(lib, "book.cbz");
      await createZip(
        zipPath,
        formatInfoContent(fields({ title: "압축 안", series: ["a", "b"] })),
      );
      await scanFile(zipPath);
      const book = await bookAt(zipPath);

      const result = await handleGetBookInfoFile(book.id);

      expect(result.success).toBe(true);
      expect(result.data?.fields.title).toBe("압축 안");
      // DB는 시리즈를 하나만 두므로 파일에서 읽어야 둘 다 남는다
      expect(result.data?.fields.series).toEqual(["a", "b"]);
      expect(result.data?.isArchive).toBe(true);
      expect(result.data?.targetPath).toBe(`${zipPath}.info.txt`);
      expect(result.data?.targetExists).toBe(false);
    });

    it("info 파일이 아예 없으면 DB 값으로 채운다", async () => {
      const lib = await newLibrary();
      const folder = path.join(lib, "plain-folder");
      await createFolderBook(folder);
      await scanFile(folder);
      const book = await bookAt(folder);
      await db("Tag").insert({ id: 900, name: "female:glasses" });
      await db("BookTag").insert({ book_id: book.id, tag_id: 900 });

      const result = await handleGetBookInfoFile(book.id);

      expect(result.data?.fields.title).toBe("plain-folder");
      expect(result.data?.fields.tags).toEqual(["female:glasses"]);
      expect(result.data?.targetPath).toBe(path.join(folder, "info.txt"));
      expect(result.data?.targetExists).toBe(false);
    });
  });

  describe("handleSaveBookInfoFile", () => {
    it("압축 책은 옆 파일에 쓰고 압축은 건드리지 않은 채 바로 반영한다", async () => {
      const lib = await newLibrary();
      const zipPath = path.join(lib, "book.cbz");
      await createZip(zipPath, formatInfoContent(fields({ title: "압축 안" })));
      await scanFile(zipPath);
      const before = await fs.stat(zipPath);
      const book = await bookAt(zipPath);

      const result = await handleSaveBookInfoFile({
        bookId: book.id,
        fields: fields({
          title: "고친 제목",
          tags: ["female:glasses", "story arc"],
        }),
      });

      expect(result).toEqual({ success: true });
      const after = await fs.stat(zipPath);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      const saved = await fs.readFile(`${zipPath}.info.txt`, "utf-8");
      expect(saved).toContain("태그: female:glasses, story_arc");

      const updated = await bookAt(zipPath);
      expect(updated.title).toBe("고친 제목");
      expect((await tagNames(updated.id)).sort()).toEqual([
        "female:glasses",
        "story_arc",
      ]);
    });

    it("폴더 책은 info.txt가 없으면 폴더 안에 새로 만든다", async () => {
      const lib = await newLibrary();
      const folder = path.join(lib, "new-info");
      await createFolderBook(folder);
      await scanFile(folder);
      const book = await bookAt(folder);

      await handleSaveBookInfoFile({
        bookId: book.id,
        fields: fields({ title: "새 info" }),
      });

      expect(
        await fs.readFile(path.join(folder, "info.txt"), "utf-8"),
      ).toContain("제목: 새 info");
      expect((await bookAt(folder)).title).toBe("새 info");
    });

    it("폴더 책이 옆 파일만 가지고 있으면 그 파일을 고친다", async () => {
      const lib = await newLibrary();
      const folder = path.join(lib, "side-only");
      await createFolderBook(folder);
      await fs.writeFile(
        `${folder}.info.txt`,
        formatInfoContent(fields({ title: "옆" })),
      );
      await scanFile(folder);
      const book = await bookAt(folder);

      await handleSaveBookInfoFile({
        bookId: book.id,
        fields: fields({ title: "옆 고침" }),
      });

      await expect(fs.access(path.join(folder, "info.txt"))).rejects.toThrow();
      expect(await fs.readFile(`${folder}.info.txt`, "utf-8")).toContain(
        "제목: 옆 고침",
      );
    });

    it("숫자가 아닌 갤러리 넘버와 빈 제목은 쓰지 않는다", async () => {
      const lib = await newLibrary();
      const folder = path.join(lib, "invalid");
      await createFolderBook(folder);
      await scanFile(folder);
      const book = await bookAt(folder);

      const badId = await handleSaveBookInfoFile({
        bookId: book.id,
        fields: fields({ hitomi_id: "12a" }),
      });
      const noTitle = await handleSaveBookInfoFile({
        bookId: book.id,
        fields: fields({ title: "  " }),
      });

      expect(badId.success).toBe(false);
      expect(noTitle.success).toBe(false);
      await expect(fs.access(path.join(folder, "info.txt"))).rejects.toThrow();
    });
  });
});
