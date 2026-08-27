import path from "path";
import { naturalSort } from "./index.js";

// 뷰어·썸네일·스캔이 서로 다른 목록을 쓰면 표지와 1페이지가 어긋난다.
export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
] as const;

const EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);

export function isImageFile(fileName: string): boolean {
  return EXTENSION_SET.has(path.extname(fileName).toLowerCase());
}

export function sortImageFiles(fileNames: string[]): string[] {
  return fileNames.filter(isImageFile).sort(naturalSort);
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export function imageMimeType(fileName: string): string {
  return (
    MIME_TYPES[path.extname(fileName).toLowerCase()] ??
    "application/octet-stream"
  );
}
