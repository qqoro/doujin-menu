/** 중복 그룹 비교의 순수 계산. `Duplicates.vue`가 그리기 전에 쓰는 값들이다 */

import type { DuplicateBookInfo, DuplicateGroup } from "../../types/ipc";

/** 사람이 읽는 용량 표기 */
export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);

  // 1GB 미만은 소수점이 노이즈다. 340MB면 충분하고 340.28MB는 읽는 데 방해만 된다
  const decimals = exponent >= 3 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[exponent]}`;
};

/**
 * 그룹 안에서 "더 나은 쪽"으로 강조할 값.
 *
 * 사본끼리 값이 전부 같으면 `null`이다. 차이가 없는데 한쪽을 강조하면
 * 없는 우열을 있는 것처럼 읽히게 만든다.
 */
export interface GroupHighlight {
  bestPageCount: number | null;
  bestFileSize: number | null;
}

const bestOf = (values: (number | null | undefined)[]): number | null => {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return null;

  const max = Math.max(...known);
  // 전부 같은 값이면 우열이 없다
  return known.every((v) => v === max) ? null : max;
};

export const computeGroupHighlight = (
  books: DuplicateBookInfo[],
): GroupHighlight => ({
  bestPageCount: bestOf(books.map((book) => book.page_count)),
  bestFileSize: bestOf(books.map((book) => book.file_size)),
});

/**
 * 그룹에서 하나만 남겼을 때 되찾는 용량. 가장 큰 사본을 남긴다고 본다.
 *
 * 용량을 모르는 사본이 하나라도 있으면 `null`이다. 아는 것만 더하면 실제보다
 * 작은 숫자가 나와서, 지워도 별로 안 줄어드는 것처럼 보인다.
 */
export const groupReclaimableSize = (
  books: DuplicateBookInfo[],
): number | null => {
  if (books.length < 2) return 0;
  if (books.some((book) => book.file_size == null)) return null;

  const sizes = books.map((book) => book.file_size as number);
  return sizes.reduce((sum, size) => sum + size, 0) - Math.max(...sizes);
};

export interface DuplicateSummary {
  groupCount: number;
  bookCount: number;
  /** 용량을 계산할 수 있는 그룹만 합산한 값 */
  reclaimableSize: number;
  /** 용량 미상이라 합산에서 빠진 그룹 수 */
  unknownSizeGroups: number;
}

export const summarizeGroups = (groups: DuplicateGroup[]): DuplicateSummary => {
  let reclaimableSize = 0;
  let unknownSizeGroups = 0;

  for (const group of groups) {
    const reclaimable = groupReclaimableSize(group.books);
    if (reclaimable == null) {
      unknownSizeGroups++;
    } else {
      reclaimableSize += reclaimable;
    }
  }

  return {
    groupCount: groups.length,
    bookCount: groups.reduce((sum, group) => sum + group.books.length, 0),
    reclaimableSize,
    unknownSizeGroups,
  };
};

/**
 * 그룹 헤더에 쓰는 대표 제목.
 *
 * hitomi_id 그룹은 key가 숫자고 title_normalized 그룹은 key가 정규화 문자열이라,
 * 어느 쪽도 사람이 읽을 게 못 된다. 그래서 첫 사본의 제목을 쓴다.
 */
export const groupTitle = (group: DuplicateGroup): string =>
  group.books[0]?.title ?? group.key;

const MATCH_TYPE_LABELS: Record<DuplicateGroup["matchType"], string> = {
  hitomi_id: "ID 일치",
  title: "제목 일치",
  title_normalized: "제목 유사",
};

export const matchTypeLabel = (
  matchType: DuplicateGroup["matchType"],
): string => MATCH_TYPE_LABELS[matchType];

/** 근거가 확실한 순으로 배지 색을 달리해 정확도 차이를 눈에 보이게 한다 */
export const matchTypeBadgeVariant = (
  matchType: DuplicateGroup["matchType"],
): "default" | "secondary" | "outline" => {
  if (matchType === "hitomi_id") return "default";
  return matchType === "title" ? "secondary" : "outline";
};

export type DuplicateSortBy = "reclaimable" | "count" | "title";

/**
 * 그룹 정렬. 용량 미상 그룹은 항상 뒤로 보낸다 — 0으로 취급해 섞으면
 * "절약할 게 없는 그룹"과 구분이 안 된다.
 */
export const sortGroups = (
  groups: DuplicateGroup[],
  sortBy: DuplicateSortBy,
): DuplicateGroup[] => {
  const sorted = [...groups];

  if (sortBy === "count") {
    return sorted.sort(
      (a, b) => b.books.length - a.books.length || a.key.localeCompare(b.key),
    );
  }

  if (sortBy === "title") {
    return sorted.sort((a, b) =>
      groupTitle(a).localeCompare(groupTitle(b), "ko"),
    );
  }

  return sorted.sort((a, b) => {
    const sizeA = groupReclaimableSize(a.books);
    const sizeB = groupReclaimableSize(b.books);
    if (sizeA == null && sizeB == null) return 0;
    if (sizeA == null) return 1;
    if (sizeB == null) return -1;
    return sizeB - sizeA;
  });
};

/**
 * 검색어로 그룹을 거른다. 사본 중 하나라도 제목·작가가 맞으면 그룹째 남긴다.
 *
 * 행 단위로 거르면 남은 사본만 보여서 "2권 중복"이 "1권"으로 보인다.
 */
export const filterGroups = (
  groups: DuplicateGroup[],
  query: string,
  matchType: "all" | DuplicateGroup["matchType"],
): DuplicateGroup[] => {
  const keyword = query.trim().toLowerCase();

  return groups.filter((group) => {
    if (matchType !== "all" && group.matchType !== matchType) return false;
    if (!keyword) return true;

    return group.books.some(
      (book) =>
        book.title.toLowerCase().includes(keyword) ||
        book.artists?.some((artist) =>
          artist.name.toLowerCase().includes(keyword),
        ),
    );
  });
};
