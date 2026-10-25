import path from "path";

/**
 * 요청 경로가 허용 폴더 중 하나의 "안쪽"일 때만 정규화한 절대 경로를 돌려준다.
 * 쿼리로 경로를 받으므로 이 검사가 없으면 PC의 아무 파일이나 읽힌다.
 */
export function resolveAllowedMediaFile(
  requestedPath: string,
  allowedRoots: string[],
): string | null {
  const resolved = path.resolve(requestedPath);
  const target = resolved.toLowerCase();

  for (const root of allowedRoots) {
    const prefix = (path.resolve(root) + path.sep).toLowerCase();
    if (target.startsWith(prefix) && target.length > prefix.length) {
      return resolved;
    }
  }
  return null;
}
