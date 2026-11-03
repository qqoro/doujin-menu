import fs from "fs/promises";
import path from "path";

export const isArchivePath = (bookPath: string) =>
  /\.(zip|cbz)$/i.test(bookPath);

/** 폴더 책 `A` → `A.info.txt`, 압축 책 `A.cbz` → `A.cbz.info.txt` */
export const sidecarPathFor = (bookPath: string) =>
  path.join(path.dirname(bookPath), `${path.basename(bookPath)}.info.txt`);

export const innerInfoPathFor = (folderPath: string) =>
  path.join(folderPath, "info.txt");

/** 파일이 없거나 파일이 아니면 null */
export async function fileMtimeOrNull(
  filePath: string,
): Promise<number | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? stats.mtimeMs : null;
  } catch {
    return null;
  }
}

/**
 * 정보 수정이 쓰는 파일. 스캐너가 읽는 우선순위와 같아야 고친 내용이 읽힌다.
 *
 * - 폴더 책: 폴더 안 `info.txt` > 옆 파일. 둘 다 없으면 폴더 안에 새로 만든다
 * - 압축 책: 언제나 옆 파일. 압축 안의 `info.txt`는 고칠 수 없어서 스캐너가
 *   옆 파일을 먼저 읽는다
 */
export async function resolveInfoWriteTarget(
  bookPath: string,
): Promise<{ path: string; exists: boolean }> {
  if (isArchivePath(bookPath)) {
    const sidecar = sidecarPathFor(bookPath);
    return { path: sidecar, exists: (await fileMtimeOrNull(sidecar)) !== null };
  }

  const inner = innerInfoPathFor(bookPath);
  if ((await fileMtimeOrNull(inner)) !== null) {
    return { path: inner, exists: true };
  }
  const sidecar = sidecarPathFor(bookPath);
  if ((await fileMtimeOrNull(sidecar)) !== null) {
    return { path: sidecar, exists: true };
  }
  return { path: inner, exists: false };
}
