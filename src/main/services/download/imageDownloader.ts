import fs from "fs/promises";
import path from "path";

/**
 * 이미지 목록을 순서대로 내려받는 공용 루프.
 *
 * 소스마다 다른 것은 "이미지 URL을 어떻게 얻는가"와 요청 헤더뿐이라, 이어받기·
 * 재시도·취소·진행률은 여기 한 곳에 둡니다.
 */

/** 파일 하나에 허용하는 최대 시도 횟수 */
export const MAX_FILE_ATTEMPTS = 10;

export const defaultRetryDelay = (attempt: number) =>
  Math.min(1000 * 2 ** (attempt - 1), 30_000);

/** 확장자 없는 서명 URL이 흔해서 못 알아보면 webp로 떨어뜨립니다. */
const KNOWN_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "bmp",
]);

const extensionOf = (url: string): string => {
  const withoutQuery = url.split("?")[0];
  const candidate = withoutQuery.split(".").pop()?.toLowerCase() ?? "";
  return KNOWN_EXTENSIONS.has(candidate) ? candidate : "webp";
};

export interface DownloadImagesOptions {
  urls: string[];
  targetDir: string;
  headers?: Record<string, string>;
  maxAttempts?: number;
  retryDelay?: (attempt: number) => number;
  shouldCancel?: () => boolean;
  onProgress?: (downloaded: number, total: number) => void | Promise<void>;
  /**
   * 403을 만났을 때 URL 목록을 새로 받아옵니다.
   * 서명이 붙은 URL은 시간이 지나면 죽으므로, 재시도가 아니라 갱신이 답입니다.
   */
  refreshUrls?: () => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

export interface DownloadImagesResult {
  completed: boolean;
  cancelled: boolean;
  downloaded: number;
}

/** 갱신했는데도 한 장을 못 받는 일이 이만큼 연속되면 끊습니다. */
const MAX_FRUITLESS_REFRESHES = 2;

export const downloadImages = async ({
  urls,
  targetDir,
  headers,
  maxAttempts = MAX_FILE_ATTEMPTS,
  retryDelay = defaultRetryDelay,
  shouldCancel,
  onProgress,
  refreshUrls,
  fetchImpl = fetch,
}: DownloadImagesOptions): Promise<DownloadImagesResult> => {
  await fs.mkdir(targetDir, { recursive: true });

  let current = [...urls];
  const total = current.length;
  let fruitlessRefreshes = 0;

  for (let index = 0; index < total; index++) {
    if (shouldCancel?.()) {
      return { completed: false, cancelled: true, downloaded: index };
    }

    const fileName = `${String(index + 1).padStart(6, "0")}.${extensionOf(current[index])}`;
    const filePath = path.join(targetDir, fileName);

    // 이미 받아 둔 파일은 건너뜁니다 (이어받기).
    let alreadyThere = true;
    try {
      await fs.access(filePath);
    } catch {
      alreadyThere = false;
    }
    if (alreadyThere) {
      await onProgress?.(index + 1, total);
      continue;
    }

    let saved = false;
    for (let attempt = 1; attempt <= maxAttempts && !saved; attempt++) {
      if (shouldCancel?.()) {
        return { completed: false, cancelled: true, downloaded: index };
      }

      let status = 0;
      try {
        const response = await fetchImpl(current[index], { headers });
        status = response.status;
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          await fs.writeFile(filePath, buffer);
          saved = true;
          fruitlessRefreshes = 0;
          break;
        }
      } catch {
        // 네트워크 오류는 아래 재시도 경로로 흘려보냅니다.
      }

      // 서명이 만료된 URL은 몇 번을 두드려도 403입니다. 목록을 새로 받아야 합니다.
      if (status === 403 && refreshUrls) {
        if (fruitlessRefreshes >= MAX_FRUITLESS_REFRESHES) {
          throw new Error(
            `${fileName}: 주소를 새로 받아도 내려받지 못했습니다.`,
          );
        }
        fruitlessRefreshes++;
        const refreshed = await refreshUrls();
        if (refreshed.length !== total) {
          throw new Error(
            `글의 이미지 수가 달라졌습니다 (${total} → ${refreshed.length}). 다시 시도해 주세요.`,
          );
        }
        current = refreshed;
        attempt--; // 갱신은 실패 시도로 세지 않습니다.
        continue;
      }

      if (attempt >= maxAttempts) {
        throw new Error(
          `${fileName} 다운로드를 ${maxAttempts}회 시도했지만 실패했습니다.`,
        );
      }

      const delay = retryDelay(attempt);
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    await onProgress?.(index + 1, total);
  }

  return { completed: true, cancelled: false, downloaded: total };
};
