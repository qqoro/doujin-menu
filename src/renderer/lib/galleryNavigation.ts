/**
 * 다운로더 상세보기 안의 이동 기록과 언어판 칩. DOM을 모르는 순수 함수다.
 */

import type { GalleryDto } from "@/../types/ipc";

/** 지금 보는 갤러리와 같으면 기록을 그대로 돌려준다 */
export const pushHistory = <T extends { id: number }>(
  stack: T[],
  next: T,
): T[] => (stack.at(-1)?.id === next.id ? stack : [...stack, next]);

/** 처음 갤러리에서는 더 뺄 것이 없다. 닫기는 부르는 쪽이 정한다 */
export const popHistory = <T>(stack: T[]): T[] =>
  stack.length <= 1 ? stack : stack.slice(0, -1);

export const truncateHistory = <T>(stack: T[], index: number): T[] =>
  index < 0 || index >= stack.length ? stack : stack.slice(0, index + 1);

export interface LanguageChip {
  id: number;
  label: string;
  current: boolean;
}

/**
 * 언어판 칩. 히토미의 언어판 목록에는 자기 자신도 들어 있으므로, 두 개 미만이면
 * 다른 언어판이 없다는 뜻이라 칩을 만들지 않는다.
 */
export const buildLanguageChips = (
  currentId: number,
  translations: GalleryDto["translations"],
): LanguageChip[] => {
  const seen = new Set<number>();
  const unique = translations.filter((translation) => {
    if (seen.has(translation.id)) return false;
    seen.add(translation.id);
    return true;
  });
  if (unique.length < 2) return [];

  return unique.map((translation) => ({
    id: translation.id,
    label:
      translation.languageName?.local ||
      translation.languageName?.english ||
      "알 수 없음",
    current: translation.id === currentId,
  }));
};
