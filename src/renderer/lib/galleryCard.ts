/**
 * 다운로더 카드의 상태·메타·치수 계산. 그리드와 리스트가 같은 판정을 쓰도록
 * 여기에 모은다. DOM을 모르는 순수 함수다.
 */

import type { MetaField, MetaPart } from "./cardLayout";
import { formatPublishDate } from "./formatDate";
import { tagSearchTerm, toTagParts } from "./tagBadge";

export type CardStatusKind = "owned" | "downloading" | "failed" | "idle";

export interface CardStatus {
  kind: CardStatusKind;
  /** 상태 배지 문구. 배지를 안 다는 상태면 null */
  badgeLabel: string | null;
  /** 리스트 카드 버튼 문구 */
  buttonLabel: string;
  /** 진행률 0~100. 모르면 null */
  percent: number | null;
  /** 진행 중이지만 진행률을 모르는 상태 (시작 중) */
  indeterminate: boolean;
}

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

/**
 * 카드 상태를 하나로 판정한다. 보유중이 가장 세다 — 라이브러리에 이미 있는 책은
 * 큐에 실패 기록이 남아 있어도 "가지고 있는 책"이다.
 *
 * 배지 문구와 버튼 문구를 한 함수에서 내는 건 어휘를 묶기 위해서다. 따로 두면
 * 배지는 "대기", 버튼은 "대기 중"처럼 갈라진다.
 */
export const resolveCardStatus = ({
  bookId,
  status,
  progress,
}: {
  bookId: number | null;
  status: string;
  progress?: number;
}): CardStatus => {
  if (bookId !== null || status === "completed") {
    return {
      kind: "owned",
      badgeLabel: "보유중",
      buttonLabel: "완료",
      percent: null,
      indeterminate: false,
    };
  }

  if (status === "failed") {
    return {
      kind: "failed",
      badgeLabel: "실패",
      buttonLabel: "실패",
      percent: null,
      indeterminate: false,
    };
  }

  const percent = typeof progress === "number" ? clampPercent(progress) : null;

  switch (status) {
    case "progress":
      return {
        kind: "downloading",
        badgeLabel: `${percent ?? 0}%`,
        buttonLabel: `${percent ?? 0}%`,
        percent: percent ?? 0,
        indeterminate: false,
      };
    case "starting":
      return {
        kind: "downloading",
        badgeLabel: "시작 중",
        buttonLabel: "시작 중...",
        percent: null,
        indeterminate: true,
      };
    case "pending":
      return {
        kind: "downloading",
        badgeLabel: "대기",
        buttonLabel: "대기 중",
        percent,
        indeterminate: false,
      };
    case "paused":
      return {
        kind: "downloading",
        badgeLabel: "일시정지",
        buttonLabel: "일시정지",
        percent,
        indeterminate: false,
      };
    default:
      return {
        kind: "idle",
        badgeLabel: null,
        buttonLabel: "다운로드",
        percent: null,
        indeterminate: false,
      };
  }
};

// 상세 정보 줄

export type DetailRowKey =
  | "id"
  | "artist"
  | "series"
  | "type"
  | "language"
  | "group"
  | "tag"
  | "character";

export interface DetailItem {
  text: string;
  /** 클릭 복사할 검색어. 공백→밑줄 변환은 복사하는 쪽이 한다 */
  term: string;
}

export interface DetailRow {
  key: DetailRowKey;
  items: DetailItem[];
}

/** 상세 정보에 필요한 최소 모양 */
export interface DetailSource {
  id: number;
  type?: string;
  languageName?: { local?: string | null; english?: string | null } | null;
  artists: string[];
  groups: string[];
  series: string[];
  characters: string[];
  tags: { type: string; name: string }[];
}

/**
 * 미리보기 정보 패널의 줄들. 값이 없는 줄은 빠지고 ID 줄만 항상 남는다.
 */
export const buildDetailRows = (gallery: DetailSource): DetailRow[] => {
  const names = (prefix: string, list: string[]): DetailItem[] =>
    list.map((name) => ({ text: name, term: `${prefix}:${name}` }));

  const languageText =
    gallery.languageName?.local || gallery.languageName?.english;
  const languageKey = gallery.languageName?.english?.toLowerCase();

  const rows: DetailRow[] = [
    { key: "id", items: names("id", [String(gallery.id)]) },
    { key: "artist", items: names("artist", gallery.artists) },
    { key: "series", items: names("series", gallery.series) },
    {
      key: "type",
      items: gallery.type ? names("type", [gallery.type]) : [],
    },
    {
      key: "language",
      items:
        languageText && languageKey
          ? [{ text: languageText, term: `language:${languageKey}` }]
          : [],
    },
    { key: "group", items: names("group", gallery.groups) },
    {
      key: "tag",
      items: gallery.tags.map((tag) => ({
        text: toTagParts(tag).name,
        term: tagSearchTerm(tag),
      })),
    },
    { key: "character", items: names("character", gallery.characters) },
  ];

  return rows.filter((row) => row.items.length > 0);
};

// 메타 한 줄

/** 메타 한 줄에 필요한 최소 모양. 테스트에서 갤러리를 통째로 만들지 않으려고 좁혔다 */
export interface MetaSource {
  id: number;
  type?: string;
  pageCount?: number;
  /** 현지어 이름이 없는 언어는 local이 비어 있다 */
  languageName?: { local?: string | null; english?: string | null } | null;
  releaseDate?: Date | string | number | null;
}

/**
 * `·`으로 이어붙일 메타 조각들을 만든다. 그리드와 리스트가 같은 함수에 다른 필드
 * 목록을 넘긴다. 문자열로 합치지 않는 건 `#ID`만 클릭 복사가 되어야 해서다.
 * 값이 없는 항목은 통째로 빠진다 — 안 그러면 `· · ·`만 남은 줄이 나온다.
 */
export const buildMetaLine = (
  gallery: MetaSource,
  fields: MetaField[],
): MetaPart[] => {
  const parts: MetaPart[] = [];

  for (const key of fields) {
    switch (key) {
      case "pages": {
        const count = gallery.pageCount ?? 0;
        if (count > 0) parts.push({ key, text: `${count}p` });
        break;
      }
      case "type": {
        if (gallery.type) parts.push({ key, text: gallery.type });
        break;
      }
      case "language": {
        const name =
          gallery.languageName?.local || gallery.languageName?.english;
        if (name) parts.push({ key, text: name });
        break;
      }
      case "date": {
        const text = formatPublishDate(gallery.releaseDate);
        if (text) parts.push({ key, text });
        break;
      }
      case "id": {
        parts.push({ key, text: `#${gallery.id}` });
        break;
      }
    }
  }

  return parts;
};
