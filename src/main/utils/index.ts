import filenamify from "filenamify";
import type { Gallery } from "node-hitomi";
import path from "path";

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
      const cmp = aPart.localeCompare(bPart, "en");
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return aArr.length - bArr.length;
}

/**
 * Windows MAX_PATH(260) 대응 전체 경로 예산.
 * 이미지 파일명을 위한 여유 공간을 남겨둡니다 (예: "000001.webp" = 11자).
 */
export const MAX_SAFE_PATH_LENGTH = 245; // 260 - 15 (파일명 + 여유)

export interface FolderNameOptions {
  /** 작가명·그룹명의 각 단어 첫 글자를 대문자로 변환 */
  capitalizeNames?: boolean;
}

/**
 * 각 단어의 첫 글자만 대문자로 올리고 나머지 글자는 보존합니다.
 * toLowerCase() 후 title-case를 적용하면 약어(SDF → Sdf)가 망가지므로 쓰지 않습니다.
 * 대소문자 개념이 없는 한글·일본어는 자연히 영향을 받지 않습니다.
 */
export function capitalizeWords(value: string): string {
  return value.replaceAll(
    /\S+/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1),
  );
}

/**
 * 세그먼트 하나를 Windows 호환 폴더명으로 정리합니다.
 * 규칙은 기존과 동일하며 적용 지점만 세그먼트 단위로 옮겼습니다.
 */
function sanitizeSegment(segment: string): string {
  return segment
    .replace(/\|/g, "｜")
    .replace(/\//g, "／")
    .replace(/[<>:"\\?*]/g, "")
    .replace(/\s+/g, " ") // 여러 공백을 하나로
    .trim();
}

/**
 * 갤러리 정보와 패턴을 기반으로 다운로드 폴더의 상대 경로를 생성합니다.
 * 패턴에 `\` 또는 `/`를 쓰면 하위 폴더가 만들어집니다.
 * @param gallery - 히토미 갤러리 객체
 * @param pattern - 폴더명 패턴 (예: "%artist% - %title%", "%groups%\\[%artist%] %title%")
 * @param options - 폴더명 생성 옵션
 * @returns 생성된 상대 경로 (Windows 호환, 예: "GroupA\\[ArtistA] 제목")
 */
export function formatDownloadFolderName(
  gallery: Gallery,
  pattern: string,
  options: FolderNameOptions = {},
): string {
  const { capitalizeNames = false } = options;

  // 이름성 변수에만 대문자 변환을 적용합니다. 제목은 원문 표기를 보존합니다.
  const applyCase = (value: string) =>
    capitalizeNames ? capitalizeWords(value) : value;

  // 기본 변수 값들
  const variables: Record<string, string> = {
    artist: applyCase(gallery.artists?.[0] || "N/A"),
    groups: applyCase(gallery.groups?.join(", ") || "N/A"),
    title: gallery.title.display || `ID_${gallery.id}`,
    id: String(gallery.id),
    language: gallery.languageName?.english || "N/A",
    series: gallery.series?.[0] || "N/A",
    character: gallery.characters?.[0] || "N/A",
    type: gallery.type || "N/A",
  };

  // 패턴을 "치환 전에" 구분자로 분할합니다.
  // 치환 후에 분할하면 변수 값에 든 슬래시(예: 제목 "A / B", 폴백 값 "N/A")가
  // 폴더 구분자로 새어 나가 의도치 않은 하위 폴더가 생깁니다.
  const segments = pattern
    .split(/[\\/]+/)
    // 세그먼트별 변수 치환. Fallback 패턴(%var1|var2|var3%)은
    // 왼쪽 변수부터 순서대로 확인해 "N/A"가 아닌 첫 번째 값을 사용합니다.
    .map((segment) =>
      segment.replaceAll(/%([a-zA-Z|]+)%/g, (_match, fallbackChain: string) => {
        const vars = fallbackChain.split("|");
        for (const varName of vars) {
          const value = variables[varName];
          if (value && value !== "N/A") {
            return value;
          }
        }
        return "N/A"; // 모든 fallback이 실패하면 N/A
      }),
    )
    .map(sanitizeSegment)
    // 빈 세그먼트와 상대 경로 세그먼트를 버립니다.
    // 반드시 filenamify보다 "먼저" 걸러야 합니다. filenamify는 빈 문자열을 제거하지
    // 않고 replacement("_")로 치환하므로, 순서가 뒤바뀌면 "_" 폴더가 남습니다.
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    // filenamify에는 문자 규칙(예약 장치명·끝 마침표·제어 문자)만 위임하고,
    // 길이는 MAX_SAFE_PATH_LENGTH 전체 경로 예산이 관리합니다.
    // maxLength를 생략하면 라이브러리 기본값 100자가 걸리는데, 이는 OS 제약이 아니라
    // 저자 주관이라 100자 넘는 제목이 흔한 이곳에 맞지 않습니다.
    // 예산과 같은 값을 넘겨 무력화합니다 — downloadPath가 최소 3자라 세그먼트는 항상 더 짧습니다.
    .map((segment) =>
      filenamify(segment, {
        maxLength: MAX_SAFE_PATH_LENGTH,
        replacement: "_",
      }),
    );

  // 모든 세그먼트가 버려진 경우(예: 패턴이 구분자뿐) 갤러리 ID로 폴백합니다.
  if (segments.length === 0) {
    return String(gallery.id);
  }

  return path.join(...segments);
}

/**
 * 갤러리의 최종 다운로드 경로를 생성합니다.
 * 다운로드와 큐 삭제 양쪽이 이 함수를 공유해야 합니다. 과거 두 핸들러가 각자
 * 경로를 계산하다 filenamify maxLength가 100/255로 어긋나, 생성된 폴더와
 * 삭제 대상 경로가 달라지는 버그가 있었습니다.
 * @param downloadPath - 다운로드 루트 경로 (절대 경로)
 * @param gallery - 히토미 갤러리 객체
 * @param pattern - 폴더명 패턴
 * @param options - 폴더명 생성 옵션
 * @returns 최종 절대 경로
 */
export function buildGalleryDownloadPath(
  downloadPath: string,
  gallery: Gallery,
  pattern: string,
  options: FolderNameOptions = {},
): string {
  const segments = formatDownloadFolderName(gallery, pattern, options).split(
    path.sep,
  );
  const fullPath = path.join(downloadPath, ...segments);

  // 전체 경로가 예산 내면 그대로 사용합니다.
  if (fullPath.length <= MAX_SAFE_PATH_LENGTH) {
    return fullPath;
  }

  const parentSegments = segments.slice(0, -1);
  const lastSegment = segments[segments.length - 1];
  const parentPath =
    parentSegments.length > 0 ? path.join(...parentSegments) : "";

  // 마지막 세그먼트 앞까지의 길이 (다운로드 경로 + 부모 경로 + 구분자들)
  const prefixLength =
    downloadPath.length + (parentPath ? parentPath.length + 1 : 0) + 1;
  const idSuffix = `... (${gallery.id})`;
  const available = MAX_SAFE_PATH_LENGTH - prefixLength - idSuffix.length;

  // 부모 경로만으로 예산을 넘기면 중첩을 포기하고 갤러리 ID로 폴백합니다.
  if (available <= 0) {
    return path.join(downloadPath, String(gallery.id));
  }

  // 마지막 세그먼트만 잘라 부모 경로를 보존합니다.
  // 통째로 substring하면 구분자 중간이 잘려 경로가 깨집니다.
  // 자르는 과정에서 예약 장치명이나 끝 마침표가 생길 수 있어 filenamify를 다시 적용합니다.
  const truncated = filenamify(
    lastSegment.substring(0, available).trim() + idSuffix,
    { maxLength: MAX_SAFE_PATH_LENGTH, replacement: "_" },
  );

  return path.join(downloadPath, ...parentSegments, truncated);
}
