/**
 * 임시 썸네일 경로의 렌더러 모듈 레벨 캐시.
 *
 * 가상 스크롤에서 IPC 횟수는 항목 수가 아니라 **스크롤 이동 거리**에 비례합니다.
 * 6열 그리드에서 한 행 내렸다 올리면 12장이 언마운트/재마운트되는데,
 * 컴포넌트 로컬 상태만으로는 그때마다 다시 요청하고 회색 박스를 먼저 그립니다.
 *
 * 메인 쪽에 디스크 캐시가 있어도(`downloaderHandler.ts`) 호출마다 `fs.mkdir` +
 * `fs.access`가 도는 건 그대로라, 왕복 자체를 없애는 게 목적입니다.
 */

import { ipcRenderer } from "@/api";

/**
 * 장시간 스크롤에서 무한히 자라지 않도록 상한을 둡니다.
 * 경로 문자열만 담으므로 2,000개라도 수백 KB 수준입니다.
 */
const MAX_ENTRIES = 2000;

/** Map은 삽입 순서를 유지하므로 이것만으로 LRU가 됩니다 */
const cache = new Map<string, string>();

/** 진행 중인 요청. 같은 카드가 빠르게 재마운트될 때 두 번 나가는 걸 막습니다 */
const inflight = new Map<string, Promise<string | null>>();

// URL에는 개행이 들어갈 수 없으므로 구분자로 안전합니다
const makeKey = (galleryId: number, url: string) => `${galleryId}\n${url}`;

const trim = () => {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
};

/**
 * 캐시에 있으면 동기적으로 반환합니다. 없으면 `undefined`.
 *
 * 컴포넌트가 setup 시점에 이걸로 초기 상태를 정하면 재마운트 때
 * 로딩 스켈레톤이 한 프레임도 안 보입니다.
 */
export const peekTempThumbnail = (
  galleryId: number,
  url: string,
): string | undefined => cache.get(makeKey(galleryId, url));

/**
 * 캐시를 거쳐 임시 썸네일을 받아옵니다. 실패하면 `null`.
 */
export const loadTempThumbnail = async (
  galleryId: number,
  url: string,
  referer: string,
): Promise<string | null> => {
  const key = makeKey(galleryId, url);

  const hit = cache.get(key);
  if (hit) {
    // 최근 쓴 항목을 뒤로 보내 LRU 순서를 유지합니다
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const result = await ipcRenderer.invoke("download-temp-thumbnail", {
      url,
      referer,
      galleryId,
    });

    if (result.success && result.data) {
      cache.set(key, result.data);
      trim();
      return result.data;
    }
    // 실패는 캐시하지 않습니다. 재시도 로직이 다시 부를 수 있어야 합니다
    return null;
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
};

/**
 * 캐시를 비웁니다.
 *
 * 설정의 "임시 파일 삭제"가 디스크의 실제 파일을 지우므로, 이걸 같이
 * 호출하지 않으면 캐시가 사라진 경로를 계속 내줘서 이미지가 깨집니다.
 */
export const clearTempThumbnailCache = () => {
  cache.clear();
  inflight.clear();
};
