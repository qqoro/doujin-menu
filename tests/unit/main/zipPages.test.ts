import archiver from "archiver";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, describe, expect, it } from "vitest";
import {
  getZipPageNames,
  readZipPage,
} from "../../../src/main/utils/zipPages.js";

let tempDir: string;

/** 엔트리를 넣은 순서 그대로 담은 zip을 만든다 (압축 순서 ≠ 파일명 순 재현용) */
async function makeZip(
  name: string,
  entries: { fileName: string; content: string }[],
): Promise<string> {
  tempDir ??= await fs.mkdtemp(path.join(os.tmpdir(), "zippages-"));
  const zipPath = path.join(tempDir, name);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 0 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    for (const entry of entries) {
      archive.append(Buffer.from(entry.content), { name: entry.fileName });
    }
    archive.finalize();
  });

  return zipPath;
}

afterAll(async () => {
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

describe("getZipPageNames", () => {
  it("압축 순서가 아니라 자연 정렬 순서로 돌려준다", async () => {
    const zipPath = await makeZip("order.cbz", [
      { fileName: "p10.jpg", content: "10" },
      { fileName: "p1.jpg", content: "1" },
      { fileName: "p2.jpg", content: "2" },
    ]);

    expect(await getZipPageNames(zipPath)).toStrictEqual([
      "p1.jpg",
      "p2.jpg",
      "p10.jpg",
    ]);
  });

  it("이미지가 아닌 엔트리를 뺀다", async () => {
    const zipPath = await makeZip("mixed.cbz", [
      { fileName: "info.txt", content: "메타" },
      { fileName: "001.png", content: "a" },
    ]);

    expect(await getZipPageNames(zipPath)).toStrictEqual(["001.png"]);
  });

});

describe("readZipPage", () => {
  it("페이지 인덱스에 해당하는 엔트리를 읽는다", async () => {
    const zipPath = await makeZip("read.cbz", [
      { fileName: "p10.jpg", content: "열번째" },
      { fileName: "p2.jpg", content: "두번째" },
      { fileName: "p1.jpg", content: "첫번째" },
    ]);

    const first = await readZipPage(zipPath, 0);
    expect(first?.fileName).toBe("p1.jpg");
    expect(first?.buffer.toString()).toBe("첫번째");

    const last = await readZipPage(zipPath, 2);
    expect(last?.fileName).toBe("p10.jpg");
    expect(last?.buffer.toString()).toBe("열번째");
  });

  it("범위를 벗어나면 null", async () => {
    const zipPath = await makeZip("range.cbz", [
      { fileName: "1.jpg", content: "a" },
    ]);

    expect(await readZipPage(zipPath, 1)).toBeNull();
    expect(await readZipPage(zipPath, -1)).toBeNull();
  });

  it("이미지가 하나도 없으면 null", async () => {
    const zipPath = await makeZip("empty.cbz", [
      { fileName: "info.txt", content: "메타" },
    ]);

    expect(await readZipPage(zipPath, 0)).toBeNull();
  });
});
