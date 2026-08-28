import * as yauzl from "yauzl";
import { isImageFile } from "./imageFiles.js";
import { naturalSort } from "./index.js";

/** ZIP 안의 이미지 엔트리 이름을 페이지 순서로 돌려준다 */
export async function getZipPageNames(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true, autoClose: false },
      (err, zipfile) => {
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
      },
    );
  });
}

/** 범위를 벗어난 페이지는 null */
export async function readZipPage(
  zipPath: string,
  pageIndex: number,
): Promise<{ fileName: string; buffer: Buffer } | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true, autoClose: false },
      (err, zipfile) => {
        if (err) return reject(err);

        const imageEntries: { fileName: string; entry: yauzl.Entry }[] = [];

        zipfile.on("entry", (entry: yauzl.Entry) => {
          if (!entry.fileName.endsWith("/") && isImageFile(entry.fileName)) {
            imageEntries.push({ fileName: entry.fileName, entry });
          }
          zipfile.readEntry();
        });

        zipfile.on("end", () => {
          imageEntries.sort((a, b) => naturalSort(a.fileName, b.fileName));

          if (pageIndex < 0 || pageIndex >= imageEntries.length) {
            zipfile.close();
            return resolve(null);
          }

          const target = imageEntries[pageIndex];
          zipfile.openReadStream(target.entry, (streamErr, readStream) => {
            if (streamErr) {
              zipfile.close();
              return reject(streamErr);
            }

            const chunks: Buffer[] = [];
            readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
            readStream.on("end", () => {
              zipfile.close();
              resolve({
                fileName: target.fileName,
                buffer: Buffer.concat(chunks),
              });
            });
            readStream.on("error", (readErr) => {
              zipfile.close();
              reject(readErr);
            });
          });
        });

        zipfile.on("error", (zipErr) => {
          zipfile.close();
          reject(zipErr);
        });

        zipfile.readEntry();
      },
    );
  });
}
