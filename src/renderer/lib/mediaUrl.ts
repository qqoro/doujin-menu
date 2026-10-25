import { IS_REMOTE } from "./runtime";

const PAGE_PREFIX = "doujin-menu://";

/**
 * Electron 전용 이미지 주소(`doujin-menu://`, `file://`)를 휴대폰 브라우저가
 * 받을 수 있는 서버 경로로 바꾼다. Electron에서는 그대로 돌려준다.
 */
export function toMediaUrl(url: string, web: boolean = IS_REMOTE): string {
  if (!web || !url) return url;

  if (url.startsWith(PAGE_PREFIX)) {
    return `/media/page/${url.slice(PAGE_PREFIX.length)}`;
  }

  if (url.startsWith("file://")) {
    // 윈도우 경로에는 ?가 올 수 없으므로 첫 ?부터를 쿼리(캐시 버전)로 본다
    const queryStart = url.indexOf("?");
    const location = queryStart === -1 ? url : url.slice(0, queryStart);
    const query = queryStart === -1 ? "" : url.slice(queryStart + 1);

    // pathToFileURL이 만든 file:///C:/... 는 퍼센트 인코딩돼 있고,
    // 표지처럼 직접 이어 붙인 file://C:\... 는 인코딩돼 있지 않다
    const filePath = location.startsWith("file:///")
      ? decodeURIComponent(location.slice("file:///".length))
      : location.slice("file://".length);

    return `/media/file?path=${encodeURIComponent(filePath)}${query ? `&${query}` : ""}`;
  }

  return url;
}
