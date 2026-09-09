import { ZipArchive } from "archiver";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import { store as configStore } from "../../handlers/configHandler.js";
import { scanFile } from "../../handlers/directoryHandler.js";

/**
 * 이미지를 다 받은 뒤의 마무리 — 압축과 라이브러리 편입.
 * 어디서 받았는지와 무관한 단계라 다운로드 소스와 분리해 둡니다.
 */
export const finalizeDownload = async (downloadDir: string): Promise<void> => {
  const compressDownload = configStore.get("compressDownload", false);
  const compressFormat = configStore.get("compressFormat", "cbz");

  if (compressDownload) {
    const archiveFilePath = `${downloadDir}.${compressFormat}`;
    const output = createWriteStream(archiveFilePath);
    const archive = new ZipArchive({
      zlib: { level: 0 }, // 압축률 0 (무압축, 속도 우선)
    });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.directory(downloadDir, false);
    await archive.finalize();

    await new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      output.on("error", (err) => reject(err));
    });

    await fs.rm(downloadDir, { recursive: true, force: true });
  }

  const scanPath = compressDownload
    ? `${downloadDir}.${compressFormat}`
    : downloadDir;

  const libraryFolders = configStore.get("libraryFolders", []);
  const isDownloadedToLibrary = libraryFolders.some((folder) =>
    scanPath.startsWith(folder),
  );

  if (isDownloadedToLibrary) {
    await scanFile(scanPath);
  }
};
