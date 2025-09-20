import { app, ipcMain } from "electron";
import { filenamifyPath } from "filenamify";
import fs from "fs/promises";
import hitomi, { Gallery } from "node-hitomi";
import path from "path";
import { pathToFileURL } from "url";
import { store as configStore } from "./configHandler.js";
import { scanFile } from "./directoryHandler.js";

export const handleSearchGalleries = async ({
  query,
  page = 1,
}: {
  query: { searchQuery: string; offset?: number };
  page: number;
}) => {
  try {
    const terms = query.searchQuery
      .toLowerCase()
      .split(" ")
      .filter((term) => term.length > 0);

    let galleryId: number | null = null;

    for (const term of terms) {
      if (term.startsWith("id:")) {
        const id = parseInt(term.substring(3).trim());
        if (!isNaN(id)) {
          galleryId = id;
        }
      }
    }

    // 작품 ID가 있으면 해당 ID만 반환 (페이지네이션 무시)
    if (galleryId !== null) {
      return {
        success: true,
        data: [galleryId],
        hasNextPage: false,
      };
    }

    const trimmedQuery = query.searchQuery.trim();
    let ids: number[];

    if (trimmedQuery) {
      const title: string[] = [];
      const tags: string[] = [];
      trimmedQuery.split(" ").forEach((text) => {
        if (text.includes(":")) {
          tags.push(text);
        } else {
          title.push(text);
        }
      });
      ids = await hitomi.getGalleryIds({
        title: title.length > 0 ? title.join(" ") : undefined,
        tags:
          tags.length > 0 ? hitomi.getParsedTags(tags.join(" ")) : undefined,
      });
    } else {
      ids = await hitomi.getGalleryIds();
    }

    const limit = 30;
    const offset = (page - 1) * limit + (query.offset || 0);
    const pageData = ids.slice(offset, offset + limit);
    const hasNextPage = ids.length > offset + limit;

    return { success: true, data: pageData, hasNextPage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error searching galleries:", error);
    return { success: false, error: message };
  }
};

export const handleGetGalleryDetails = async (galleryId: number) => {
  try {
    const gallery = await hitomi.getGallery(galleryId);

    // 썸네일 URL 생성 로직 추가
    const thumbnailUrl = hitomi.ImageUriResolver.getImageUri(
      gallery.files[0],
      "webp",
      { isThumbnail: true },
    );
    return {
      success: true,
      data: {
        ...gallery,
        thumbnailUrl: `https://${thumbnailUrl.replace(/tn\d/, "tn").replace("bigtn", "webpbigtn")}`,
        // thumbnailUrl: `https://${thumbnailUrl}`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error getting gallery details for ID ${galleryId}:`, error);
    return { success: false, error: message };
  }
};

export const handleGetGalleryImageUrls = async (galleryId: number) => {
  try {
    const gallery = await hitomi.getGallery(galleryId);
    if (!gallery) {
      throw new Error(`Gallery with ID ${galleryId} not found.`);
    }
    const previewUrls = gallery.files.map((file) => {
      const imageUrl = hitomi.ImageUriResolver.getImageUri(file, "avif"); // 원본 이미지 URL
      return `https://${imageUrl}`;
    });
    return { success: true, data: previewUrls };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error getting image URLs for gallery ${galleryId}:`, error);
    return { success: false, error: message };
  }
};

function formatDownloadFolderName(gallery: Gallery, pattern: string): string {
  const artist = gallery.artists?.[0] || "N/A";
  const groups = gallery.groups?.join(", ") || "N/A";
  const title = gallery.title.display || `ID_${gallery.id}`;
  const id = gallery.id;
  const language = gallery.languageName?.english || "N/A";

  let folderName = pattern
    .replace(/%artist%/g, artist)
    .replace(/%groups%/g, groups)
    .replace(/%title%/g, title)
    .replace(/%id%/g, String(id))
    .replace(/%language%/g, language);

  // Windows에서 사용할 수 없는 문자 제거
  folderName = folderName
    .replace(/\|/g, "｜")
    .replace(/\//g, "／")
    .replace(/[<>:"\\?*]/g, "")
    .replace(/\s+/g, " ") // 여러 공백을 하나로
    .trim();

  return folderName;
}

export const handleDownloadGallery = async (
  event: Electron.IpcMainInvokeEvent,
  { galleryId, downloadPath }: { galleryId: number; downloadPath: string },
) => {
  const webContents = event.sender;
  try {
    webContents.send("download-progress", {
      galleryId,
      status: "starting",
    });

    const gallery = await hitomi.getGallery(galleryId);
    if (!gallery) {
      throw new Error(`Gallery with ID ${galleryId} not thrown.`);
    }

    const downloadPattern = configStore.get(
      "downloadPattern",
      "%artist% - %title%",
    );
    const galleryFolderName = formatDownloadFolderName(
      gallery,
      downloadPattern,
    );

    const galleryDownloadPath = filenamifyPath(
      path.join(downloadPath, galleryFolderName),
      { maxLength: 255, replacement: "_" },
    );

    await fs.mkdir(galleryDownloadPath, { recursive: true });

    const totalFiles = gallery.files.length;
    for (let i = 0; i < totalFiles; i++) {
      const file = gallery.files[i];
      const fileExt = file.hasWebp ? "webp" : "avif";
      const imageUrl = hitomi.ImageUriResolver.getImageUri(file, fileExt);
      const fullImageUrl = `https://${imageUrl}`;
      const fileName = `${String(file.index + 1).padStart(6, "0")}.${fileExt}`;
      const filePath = path.join(galleryDownloadPath, fileName);

      const maxRetries = 5;
      let success = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(fullImageUrl, {
            headers: {
              accept:
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
              priority: "i",
              "sec-ch-ua":
                '"Chromium";v="136", "Whale";v="4", "Not.A/Brand";v="99"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "sec-fetch-dest": "image",
              "sec-fetch-mode": "no-cors",
              "sec-fetch-site": "cross-site",
              "sec-fetch-storage-access": "active",
              "sec-gpc": "1",
              Referer: `https://hitomi.la/reader/${gallery.id}.html`,
              "Referrer-Policy": "no-referrer-when-downgrade",
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36",
            },
          });

          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            await fs.writeFile(filePath, Buffer.from(arrayBuffer));
            success = true;
            break; // 다운로드 성공, 재시도 루프 탈출
          } else {
            console.warn(
              `[Downloader] 파일 다운로드 실패. 재시도 (${attempt}/${maxRetries}): ${fileName} - ${res.statusText}`,
            );
            if (attempt < maxRetries) {
              // 재시도 전 잠시 대기 (점진적 증가)
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * attempt),
              );
            }
          }
        } catch (error) {
          console.warn(
            `[Downloader] 파일 다운로드 중 오류 발생. 재시도 (${attempt}/${maxRetries}): ${fileName}`,
            error,
          );
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!success) {
        throw new Error(
          `파일 다운로드 실패: ${fileName} (${maxRetries}회 재시도 후에도 실패)`,
        );
      }

      const progress = Math.round(((i + 1) / totalFiles) * 100);
      webContents.send("download-progress", {
        galleryId,
        status: "progress",
        progress,
      });
    }

    // info.txt 파일 생성 (설정에 따라)
    const createInfoTxtFile = configStore.get("createInfoTxtFile", true);
    if (createInfoTxtFile) {
      const infoContent = [
        `갤러리 넘버: ${gallery.id}`,
        `\n제목: ${gallery.title.display}`,
        `\n작가: ${gallery.artists?.join(", ") || "N/A"}`,
        `\n그룹: ${gallery.groups?.join(", ") || "N/A"}`,
        `\n타입: ${gallery.type || "N/A"}`,
        `\n시리즈: ${gallery.series?.join(", ") || "N/A"}`,
        `\n캐릭터: ${gallery.characters?.join(", ") || "N/A"}`,
        `\n태그: ${gallery.tags?.map((t) => (t.type === "male" || t.type === "female" ? `${t.type}:${t.name}` : t.name)).join(", ") || "N/A"}`,
        `\n언어: ${gallery.languageName?.english || "N/A"}`,
      ].join("\n");

      const infoFilePath = path.join(galleryDownloadPath, "info.txt");
      await fs.writeFile(infoFilePath, infoContent);
    }

    webContents.send("download-progress", {
      galleryId,
      status: "completed",
    });

    // 다운로드된 폴더가 라이브러리 폴더에 포함되는지 확인
    const libraryFolders = configStore.get("libraryFolders", []);
    const isDownloadedToLibrary = libraryFolders.some((folder) =>
      galleryDownloadPath.startsWith(folder),
    );

    if (isDownloadedToLibrary) {
      console.log(
        `[Main] Downloaded gallery ${galleryId} is in a library folder. Scanning: ${galleryDownloadPath}`,
      );
      await scanFile(galleryDownloadPath);
    } else {
      console.log(
        `[Main] Downloaded gallery ${galleryId} is not in a configured library folder. Skipping scan.`,
      );
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error downloading gallery ${galleryId}:`, error);
    webContents.send("download-progress", {
      galleryId,
      status: "failed",
      error: message,
    });
    return { success: false, error: message };
  }
};

export const handleDownloadTempThumbnail = async ({
  url,
  referer,
  galleryId,
}: {
  url: string;
  referer: string;
  galleryId: number;
}) => {
  try {
    const tempDir = path.join(
      app.getPath("userData"),
      "downloader_temp_thumbnails",
    );
    await fs.mkdir(tempDir, { recursive: true });

    const fileName = `${galleryId}_${path.basename(new URL(url).pathname)}`;
    const filePath = path.join(tempDir, fileName);

    // 파일이 이미 존재하면 바로 경로를 반환
    try {
      await fs.access(filePath);
      return { success: true, data: pathToFileURL(filePath).href };
    } catch {
      // 파일이 없으면 다운로드 계속
    }

    const res = await fetch(url, {
      headers: {
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download ${url}: ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    return { success: true, data: pathToFileURL(filePath).href };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error downloading temp thumbnail for ${url}:`, error);
    return { success: false, error: message };
  }
};

/**
 * 다운로더 관련 IPC 통신 핸들러를 등록합니다.
 */
export async function registerDownloaderHandlers() {
  await hitomi.ImageUriResolver.synchronize();
  setInterval(async () => {
    await hitomi.ImageUriResolver.synchronize();
  }, 30000);

  // 작품 검색 핸들러
  ipcMain.handle("search-galleries", (_event, params) =>
    handleSearchGalleries(params),
  );
  // 작품 상세 정보 조회 핸들러
  ipcMain.handle("get-gallery-details", (_event, galleryId) =>
    handleGetGalleryDetails(galleryId),
  );
  // 갤러리 이미지 URL 목록 조회 핸들러
  ipcMain.handle("get-gallery-image-urls", (_event, galleryId) =>
    handleGetGalleryImageUrls(galleryId),
  );
  // 작품 다운로드 핸들러
  ipcMain.handle("download-gallery", (event, params) =>
    handleDownloadGallery(event, params),
  );
  // 임시 썸네일 다운로드 핸들러
  ipcMain.handle("download-temp-thumbnail", (_event, params) =>
    handleDownloadTempThumbnail(params),
  );
}
