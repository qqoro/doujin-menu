import type { Gallery } from "node-hitomi";

export function naturalSort(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const aArr = a.match(re) || [];
  const bArr = b.match(re) || [];

  for (let i = 0; i < Math.min(aArr.length, bArr.length); i++) {
    const aPart = aArr[i];
    const bPart = bArr[i];

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      // Both are numbers
      if (aNum !== bNum) {
        return aNum - bNum;
      }
    } else {
      // At least one is not a number, compare as strings
      const cmp = aPart.localeCompare(bPart);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return aArr.length - bArr.length;
}

/**
 * 갤러리 정보와 패턴을 기반으로 다운로드 폴더명을 생성합니다.
 * @param gallery - 히토미 갤러리 객체
 * @param pattern - 폴더명 패턴 (예: "%artist% - %title%")
 * @returns 생성된 폴더명 (Windows 호환)
 */
export function formatDownloadFolderName(gallery: Gallery, pattern: string): string {
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
