import archiver from "archiver";
import { app, ipcMain } from "electron";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import hitomi from "node-hitomi";
import path from "path";
import { pathToFileURL } from "url";
import { console } from "../main.js";
import { broadcast, sendTo } from "../utils/broadcast.js";
import { buildGalleryDownloadPath } from "../utils/index.js";
import { store as configStore } from "./configHandler.js";
import { scanFile } from "./directoryHandler.js";
import type { Tag } from "node-hitomi";

/**
 * search-galleries IPC 응답. src/types/ipc.ts의 계약과 같은 모양을 유지합니다.
 *
 * 명시적으로 선언하는 이유: handleSearchGalleries는 try/catch로 성공/실패 두
 * 모양을 반환하는데, 그대로 두면 반환 타입이 유니온이 되어 테스트에서
 * result.total 같은 접근이 tsc --noEmit에 걸립니다. tsconfig의 include가
 * tests/도 잡습니다.
 */
interface SearchGalleriesResult {
  success: boolean;
  data?: number[];
  total?: number;
  generation?: number;
  error?: string;
}

// 검색 결과 ID 캐시. node-hitomi의 getGalleryIds는 호출할 때마다
// index-all.nozomi 전체를 다시 받으므로, 검색어별로 ID 배열을 통째로 캐시한다.

interface CachedIds {
  ids: Int32Array; // number[]는 항목당 8바이트, Int32Array는 4바이트
  at: number;
  generation: number;
}

const idCache = new Map<string, CachedIds>();
const ID_CACHE_TTL = 5 * 60 * 1000; // 히토미 인덱스가 갱신되므로 무한 캐시 금지
const ID_CACHE_MAX = 3;

/**
 * 이보다 결과가 크면 캐시를 건너뜁니다.
 *
 * 실측(2026-08-11): 언어 "전체 언어" + 빈 검색어의 총 건수가 1,191,155건입니다.
 * 처음 잡았던 50만은 하필 그 최악 케이스만 캐시에서 빼버려서, 정작 인덱스를
 * 다시 받는 비용이 가장 큰 검색이 매 페이지마다 index-all.nozomi를 통째로
 * 재요청하고 있었습니다. 캐시가 있으나 마나였던 셈입니다.
 *
 * 메모리는 Int32Array라 1,191,155 × 4바이트 ≈ 4.8MB고, LRU 3개를 다 채워도
 * 약 14MB입니다. 상한을 200만으로 올려도 최대 24MB라 충분히 감당됩니다.
 */
const ID_CACHE_SKIP_OVER = 2_000_000;

let generationCounter = 0;

/** 테스트 전용: 모듈 수준 캐시 상태를 초기화합니다. */
export const __clearIdCache = () => {
  idCache.clear();
  generationCounter = 0;
};

/**
 * 캐시 키를 만듭니다.
 *
 * 소문자화하지 않습니다. getParsedTags는 대문자를 거부하므로 artist:Foo는
 * 실패하고 artist:foo는 성공하는데, 키를 소문자화하면 둘이 같은 칸을 써서
 * 실패해야 할 검색이 성공 결과를 받게 됩니다.
 */
const buildCacheKey = (
  searchQuery: string,
  popularityOrderBy: string,
  blacklist: string[],
): string =>
  [
    searchQuery.trim().split(/\s+/).filter(Boolean).sort().join(" "),
    popularityOrderBy,
    [...blacklist].sort().join(","),
  ].join("|");

/**
 * 블랙리스트 문자열을 음성 태그로 변환합니다.
 *
 * 반드시 한 개씩 파싱합니다. getParsedTags는 한 호출 안에서 type:name 중복을
 * 만나면 예외를 던지는데, 그 dedupe 키에 isNegative가 없어서 male:yaoi와
 * -male:yaoi도 충돌합니다. 전부 join해서 한 번에 넘기면 손상된 항목 하나가
 * 블랙리스트 전체를 빈 배열로 만들고, 그러면 차단은 0건인데 UI는
 * "차단 태그 N개 적용 중"을 계속 띄우게 됩니다.
 *
 * seen에 이미 있는 태그는 건너뜁니다 — 유저가 명시적으로 검색한 태그가
 * 블랙리스트를 이깁니다.
 */
const buildBlacklistTags = (blacklist: string[], seen: Set<string>): Tag[] => {
  const negatives: Tag[] = [];

  for (const raw of blacklist) {
    try {
      const [tag] = hitomi.getParsedTags(raw.startsWith("-") ? raw : `-${raw}`);
      if (!tag) continue;

      const key = `${tag.type}:${tag.name}`;
      if (seen.has(key)) continue;

      seen.add(key);
      negatives.push(tag);
    } catch (error) {
      console.warn(
        `[Downloader] 블랙리스트 태그 파싱 실패, 건너뜁니다: ${raw}`,
        error,
      );
    }
  }

  return negatives;
};

/**
 * 검색어를 제목/태그로 나누고 히토미에서 매칭 ID 전체를 가져옵니다.
 *
 * range 인자에 주의: node-hitomi는 popularityOrderBy가 있거나
 * tags[0].isNegative가 참이면 t.range.start를 읽습니다. range를 넘기지 않으면
 * undefined.start로 TypeError가 납니다. 다만 range를 주면
 * index-all.nozomi를 한 번 더 받으므로, 필요할 때만 넘기고 양성 태그를 배열
 * 앞으로 정렬해 그 경우를 줄입니다.
 */
const fetchGalleryIds = async (
  searchQuery: string,
  popularityOrderBy: string,
  blacklist: string[],
): Promise<number[]> => {
  const title: string[] = [];
  const tagTerms: string[] = [];
  searchQuery
    .trim()
    .split(" ")
    .filter((text) => text.length > 0)
    .forEach((text) => {
      if (text.includes(":")) tagTerms.push(text);
      else title.push(text);
    });

  const parsed =
    tagTerms.length > 0 ? hitomi.getParsedTags(tagTerms.join(" ")) : [];
  const seen = new Set(parsed.map((tag) => `${tag.type}:${tag.name}`));
  const negatives = buildBlacklistTags(blacklist, seen);

  // 양성 태그를 앞으로 (정렬은 안정적이라 같은 부호끼리는 원래 순서를 지킵니다)
  const tags = [...parsed, ...negatives].sort(
    (a, b) => Number(Boolean(a.isNegative)) - Number(Boolean(b.isNegative)),
  );

  const needsRange = Boolean(popularityOrderBy) || Boolean(tags[0]?.isNegative);

  return hitomi.getGalleryIds({
    title: title.length > 0 ? title.join(" ") : undefined,
    tags: tags.length > 0 ? tags : undefined,
    popularityOrderBy: (popularityOrderBy || undefined) as
      | "day"
      | "week"
      | "month"
      | "year"
      | undefined,
    range: needsRange ? {} : undefined,
  });
};

/** 캐시에서 ID 배열을 가져오거나, 없으면 히토미에서 받아 캐시합니다. */
const getCachedIds = async (
  searchQuery: string,
  popularityOrderBy: string,
  blacklist: string[],
): Promise<CachedIds> => {
  const key = buildCacheKey(searchQuery, popularityOrderBy, blacklist);
  const cached = idCache.get(key);

  if (cached && Date.now() - cached.at < ID_CACHE_TTL) {
    return cached;
  }

  const ids = await fetchGalleryIds(searchQuery, popularityOrderBy, blacklist);
  const entry: CachedIds = {
    ids: Int32Array.from(ids),
    at: Date.now(),
    generation: ++generationCounter,
  };

  if (ids.length <= ID_CACHE_SKIP_OVER) {
    // 가장 오래된 항목부터 밀어냅니다
    if (!idCache.has(key) && idCache.size >= ID_CACHE_MAX) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of idCache) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) idCache.delete(oldestKey);
    }
    idCache.set(key, entry);
  }

  return entry;
};

export const handleSearchGalleries = async ({
  searchQuery,
  popularityOrderBy = "",
  start = 0,
  count = 30,
}: {
  searchQuery: string;
  popularityOrderBy?: "" | "day" | "week" | "month" | "year";
  start?: number;
  count?: number;
}): Promise<SearchGalleriesResult> => {
  try {
    const terms = searchQuery
      .toLowerCase()
      .split(" ")
      .filter((term) => term.length > 0);

    let galleryId: number | null = null;

    for (const term of terms) {
      // 프리픽스를 붙이든 안 붙이든 같게 굽니다. 히토미 제목에 숫자만으로 된
      // 낱말이 들어가는 일은 사실상 없어서, 숫자만 쳤으면 ID를 찾는 것으로 봅니다
      const value = term.startsWith("id:") ? term.substring(3).trim() : term;
      if (!/^\d+$/.test(value)) continue;

      const id = parseInt(value);
      if (!isNaN(id)) {
        galleryId = id;
      }
    }

    // 작품 ID 직접 조회는 블랙리스트와 인기 필터를 타지 않습니다.
    // 유저가 명시적으로 지정한 것이므로 통과시키는 게 맞습니다.
    if (galleryId !== null) {
      return { success: true, data: [galleryId], total: 1, generation: 0 };
    }

    const blacklist = configStore.get("downloaderBlacklistTags", []);
    const entry = await getCachedIds(searchQuery, popularityOrderBy, blacklist);

    const data = Array.from(entry.ids.slice(start, start + count));

    return {
      success: true,
      data,
      total: entry.ids.length,
      generation: entry.generation,
    };
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
        thumbnailUrl: `https://${thumbnailUrl}`,
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
      const fileExt = file.hasWebp ? "webp" : "avif";
      const imageUrl = hitomi.ImageUriResolver.getImageUri(file, fileExt); // 원본 이미지 URL
      return `https://${imageUrl}`;
    });
    return { success: true, data: previewUrls };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error getting image URLs for gallery ${galleryId}:`, error);
    return { success: false, error: message };
  }
};

export const handleDownloadGallery = async (
  event: Electron.IpcMainInvokeEvent,
  {
    galleryId,
    downloadPath,
    queueId,
    shouldCancel,
  }: {
    galleryId: number;
    downloadPath: string;
    queueId?: number;
    shouldCancel?: () => boolean; // 취소 확인 함수
  },
) => {
  const webContents = event.sender;
  try {
    sendTo(webContents, "download-progress", {
      galleryId,
      status: "starting",
    });

    const gallery = await hitomi.getGallery(galleryId);
    if (!gallery) {
      throw new Error(`Gallery with ID ${galleryId} not thrown.`);
    }

    const downloadPattern = configStore.get(
      "downloadPattern",
      "[%artist%] %title% (%id%)",
    );
    const capitalizeNames = configStore.get("capitalizeNames", false);

    // 경로 생성은 유틸리티 함수로 단일화되어 있습니다.
    // 큐 삭제 쪽과 반드시 동일한 경로가 나와야 하므로 직접 계산하지 마세요.
    const galleryDownloadPath = buildGalleryDownloadPath(
      downloadPath,
      gallery,
      downloadPattern,
      { capitalizeNames },
    );

    // recursive 옵션이 패턴의 중첩 폴더를 자동으로 생성합니다.
    await fs.mkdir(galleryDownloadPath, { recursive: true });

    const totalFiles = gallery.files.length;

    // 큐 ID가 있으면 total_files 업데이트
    if (queueId) {
      const db = (await import("../db/index.js")).default;
      await db("DownloadQueue").where("id", queueId).update({
        total_files: totalFiles,
      });
    }

    for (let i = 0; i < totalFiles; i++) {
      // 취소 확인
      if (shouldCancel && shouldCancel()) {
        return {
          success: false,
          error: "다운로드가 일시정지되었습니다.",
          paused: true,
        };
      }

      const file = gallery.files[i];
      const fileExt = file.hasWebp ? "webp" : "avif";
      const imageUrl = hitomi.ImageUriResolver.getImageUri(file, fileExt);
      const fullImageUrl = `https://${imageUrl}`;
      const fileName = `${String(file.index + 1).padStart(6, "0")}.${fileExt}`;
      const filePath = path.join(galleryDownloadPath, fileName);

      // 파일이 이미 존재하면 건너뛰기 (이어받기)
      try {
        await fs.access(filePath);

        // 진행률 업데이트
        const progress = Math.round(((i + 1) / totalFiles) * 100);
        sendTo(webContents, "download-progress", {
          galleryId,
          status: "progress",
          progress,
        });

        // 큐 ID가 있으면 DB 업데이트
        if (queueId) {
          const db = (await import("../db/index.js")).default;
          await db("DownloadQueue")
            .where("id", queueId)
            .update({
              progress,
              downloaded_files: i + 1,
            });

          // 모든 윈도우에 큐 업데이트 알림
          broadcast("download-queue-updated");
        }

        continue; // 다음 파일로
      } catch {
        // 파일이 없으면 다운로드 진행
      }

      let success = false;
      let attempt = 0;

      while (!success) {
        // 재시도 루프 내에서도 취소 확인
        if (shouldCancel && shouldCancel()) {
          return {
            success: false,
            error: "다운로드가 일시정지되었습니다.",
            paused: true,
          };
        }
        attempt++;
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
              `[Downloader] 파일 다운로드 실패. 재시도 (${attempt}회): ${fileName} - ${res.statusText}`,
            );
            // 재시도 전 잠시 대기 (점진적 증가)
            await new Promise<void>((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.warn(
            `[Downloader] 파일 다운로드 중 오류 발생. 재시도 (${attempt}회): ${fileName}`,
            error,
          );
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        }
      }

      const progress = Math.round(((i + 1) / totalFiles) * 100);
      sendTo(webContents, "download-progress", {
        galleryId,
        status: "progress",
        progress,
      });

      // 큐 ID가 있으면 DB 업데이트
      if (queueId) {
        const db = (await import("../db/index.js")).default;
        await db("DownloadQueue")
          .where("id", queueId)
          .update({
            progress,
            downloaded_files: i + 1,
          });

        // 모든 윈도우에 큐 업데이트 알림
        broadcast("download-queue-updated");
      }
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

    // 압축 설정 확인 및 처리
    const compressDownload = configStore.get("compressDownload", false);
    const compressFormat = configStore.get("compressFormat", "cbz");

    if (compressDownload) {
      // 압축 파일 경로 생성
      const archiveFilePath = `${galleryDownloadPath}.${compressFormat}`;

      // 압축 스트림 생성
      const output = createWriteStream(archiveFilePath);
      const archive = archiver("zip", {
        zlib: { level: 0 }, // 압축률 0 (무압축, 속도 우선)
      });

      // 에러 핸들링
      archive.on("error", (err) => {
        throw err;
      });

      // 스트림 연결
      archive.pipe(output);

      // 폴더 내 모든 파일 추가
      archive.directory(galleryDownloadPath, false);

      // 압축 완료
      await archive.finalize();

      // 압축 완료 대기
      await new Promise<void>((resolve, reject) => {
        output.on("close", () => resolve());
        output.on("error", (err) => reject(err));
      });

      // 원본 폴더 삭제
      await fs.rm(galleryDownloadPath, { recursive: true, force: true });
    }

    sendTo(webContents, "download-progress", {
      galleryId,
      status: "completed",
    });

    // 다운로드된 폴더/파일이 라이브러리 폴더에 포함되는지 확인
    const libraryFolders = configStore.get("libraryFolders", []);

    // 압축된 경우 압축 파일 경로로, 아닌 경우 폴더 경로로 스캔
    const scanPath = compressDownload
      ? `${galleryDownloadPath}.${compressFormat}`
      : galleryDownloadPath;

    const isDownloadedToLibrary = libraryFolders.some((folder) =>
      scanPath.startsWith(folder),
    );

    if (isDownloadedToLibrary) {
      await scanFile(scanPath);
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error downloading gallery ${galleryId}:`, error);
    sendTo(webContents, "download-progress", {
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
