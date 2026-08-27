import fs from "fs/promises";
import * as yauzl from "yauzl";
import { isImageFile } from "./imageFiles.js";
import { naturalSort } from "./index.js";

interface CachedPages {
  mtimeMs: number;
  size: number;
  fileNames: string[];
}

/**
 * 열린 zipfile 핸들을 캐시하면 더 빠르지만, Windows에서 파일이 잠겨 책 삭제와
 * 라이브러리 재스캔이 실패한다. 이름 목록만 들고 있는다.
 */
const pageCache = new Map<string, CachedPages>();

const MAX_CACHE_ENTRIES = 8;

/** 테스트 전용 */
export const __resetZipPageCache = (): void => {
  pageCache.clear();
};

/** ZIP 안의 이미지 엔트리 이름을 페이지 순서로 돌려준다 */
export async function getZipPageNames(zipPath: string): Promise<string[]> {
  const stat = await fs.stat(zipPath);
  const cached = pageCache.get(zipPath);

  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.fileNames;
  }

  const fileNames = await readImageEntryNames(zipPath);

  // 삽입 순서가 곧 LRU 순서다.
  pageCache.delete(zipPath);
  pageCache.set(zipPath, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    fileNames,
  });
  while (pageCache.size > MAX_CACHE_ENTRIES) {
    const oldest = pageCache.keys().next().value;
    if (oldest === undefined) break;
    pageCache.delete(oldest);
  }

  return fileNames;
}

function readImageEntryNames(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      const fileNames: string[] = [];

      zipfile.on("entry", (entry: yauzl.Entry) => {
        if (!entry.fileName.endsWith("/") && isImageFile(entry.fileName)) {
          fileNames.push(entry.fileName);
        }
        zipfile.readEntry();
      });

      zipfile.on("end", () => {
        zipfile.close();
        resolve(fileNames.sort(naturalSort));
      });

      zipfile.on("error", (zipErr) => {
        zipfile.close();
        reject(zipErr);
      });

      zipfile.readEntry();
    });
  });
}

/** 범위를 벗어난 페이지는 null */
export async function readZipPage(
  zipPath: string,
  pageIndex: number,
): Promise<{ fileName: string; buffer: Buffer } | null> {
  const fileNames = await getZipPageNames(zipPath);

  if (pageIndex < 0 || pageIndex >= fileNames.length) {
    return null;
  }

  const targetName = fileNames[pageIndex];

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let found = false;

      zipfile.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName !== targetName) {
          zipfile.readEntry();
          return;
        }

        found = true;
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            zipfile.close();
            return reject(streamErr);
          }

          const chunks: Buffer[] = [];
          readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
          readStream.on("end", () => {
            zipfile.close();
            resolve(Buffer.concat(chunks));
          });
          readStream.on("error", (readErr) => {
            zipfile.close();
            reject(readErr);
          });
        });
      });

      zipfile.on("end", () => {
        if (!found) {
          zipfile.close();
          reject(new Error(`ZIP에 페이지가 없습니다: ${targetName}`));
        }
      });

      zipfile.on("error", (zipErr) => {
        zipfile.close();
        reject(zipErr);
      });

      zipfile.readEntry();
    });
  });

  return { fileName: targetName, buffer };
}
