/** 책 카드의 순수 계산. `BookCard`와 `BookRowCard`가 같은 결과를 내도록 공유한다 */

import type { MetaField, MetaPart } from "./cardLayout";
import { formatPublishDate } from "./formatDate";

export interface NamedItem {
  name: string;
}

/**
 * 이름이 비어 있는 항목을 걸러낸다. 메타데이터가 없는 책은 `[{ name: "" }]`처럼
 * 들어오는 경우가 있어 길이만 보고 판단하면 빈 칩이 그려진다.
 */
export const filterValidNames = <T extends NamedItem>(
  items: T[] | null | undefined,
): T[] =>
  (items ?? []).filter((item) => !!item?.name && item.name.trim() !== "");

/**
 * 표지 이미지 URL. `version`은 캐시 무효화용이다 — 재스캔으로 썸네일이 같은
 * 경로에 새로 쓰이면 브라우저가 옛 이미지를 그대로 보여준다.
 */
export const buildCoverUrl = (
  coverPath: string | null | undefined,
  version: number,
): string => {
  if (!coverPath) return "";
  return version ? `file://${coverPath}?v=${version}` : `file://${coverPath}`;
};

/** 작가나 그룹 중 하나라도 있는지 */
export const hasCreatorInfo = (
  artists: NamedItem[],
  groups: NamedItem[],
): boolean => artists.length > 0 || groups.length > 0;

/** 메타 한 줄에 필요한 최소 모양. 테스트에서 책을 통째로 만들지 않으려고 좁혔다 */
export interface BookMetaSource {
  page_count?: number;
  type?: string;
  language_name_local?: string;
  language_name_english?: string;
  added_at?: string;
  hitomi_id?: string;
}

/**
 * `·`으로 이어붙일 메타 조각들을 만든다. 다운로더의 `buildMetaLine`과 같은
 * `MetaPart[]`를 내보내 같은 컴포넌트가 그린다(원본 필드가 달라 함수만 나눈다).
 * 값이 없는 항목은 통째로 빠진다 — 안 그러면 `· · ·`만 남은 줄이 나온다.
 */
export const buildBookMetaLine = (
  book: BookMetaSource,
  fields: MetaField[],
): MetaPart[] => {
  const parts: MetaPart[] = [];

  for (const key of fields) {
    switch (key) {
      case "pages": {
        const count = book.page_count ?? 0;
        if (count > 0) parts.push({ key, text: `${count}p` });
        break;
      }
      case "type": {
        if (book.type) parts.push({ key, text: book.type });
        break;
      }
      case "language": {
        const name = book.language_name_local || book.language_name_english;
        if (name) parts.push({ key, text: name });
        break;
      }
      case "date": {
        const text = formatPublishDate(book.added_at);
        if (text) parts.push({ key, text });
        break;
      }
      case "id": {
        if (book.hitomi_id) parts.push({ key, text: `#${book.hitomi_id}` });
        break;
      }
    }
  }

  return parts;
};

// 카드 메뉴

export interface BookMenuItem {
  key: string;
  icon: string;
  label: string;
  /** 아이콘에 덧붙일 클래스 (재스캔 중 회전 등) */
  iconClass?: string;
  /** 위에 구분선을 그린다 */
  separatorBefore?: boolean;
  action: () => void;
}

export interface BookMenuFlags {
  isFavorite: boolean;
  hasExternalViewer: boolean;
  isRescanning: boolean;
}

export type BookMenuActionKey =
  | "favorite"
  | "folder"
  | "newWindow"
  | "external"
  | "details"
  | "preview"
  | "rescan"
  | "delete";

export type BookMenuActions = Record<BookMenuActionKey, () => void>;

/**
 * 카드 메뉴 항목. 우클릭 메뉴와 드롭다운이 같은 배열을 그린다.
 * Reka UI는 항목 컴포넌트가 달라 마크업은 따로지만, 정의까지 나누면 한쪽만
 * 고쳐져 두 메뉴가 갈라진다.
 *
 * actions는 부분 전달이 가능하다 — 없는 항목은 그 화면이 쓰지 않는 것이므로
 * 빠진다. 라이브러리는 전부를, 다른 화면은 필요한 것만 넘긴다.
 */
export const buildBookMenuItems = (
  flags: BookMenuFlags,
  actions: Partial<BookMenuActions>,
): BookMenuItem[] => {
  type Candidate = { action?: () => void; item: Omit<BookMenuItem, "action"> };

  const candidates: Candidate[] = [
    {
      action: actions.favorite,
      item: {
        key: "favorite",
        icon: flags.isFavorite
          ? "solar:heart-broken-line-duotone"
          : "solar:heart-bold-duotone",
        label: flags.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가",
      },
    },
    {
      action: actions.folder,
      item: {
        key: "folder",
        icon: "solar:folder-open-bold-duotone",
        label: "폴더 열기",
      },
    },
    {
      action: actions.newWindow,
      item: {
        key: "new-window",
        icon: "solar:square-top-down-bold-duotone",
        label: "새 창으로 열기",
      },
    },
    // 외부 뷰어 경로가 설정돼 있을 때만 노출한다
    {
      action: flags.hasExternalViewer ? actions.external : undefined,
      item: {
        key: "external",
        icon: "solar:monitor-bold-duotone",
        label: "외부 프로그램으로 열기",
      },
    },
    {
      action: actions.details,
      item: {
        key: "details",
        icon: "solar:info-circle-bold-duotone",
        label: "상세 정보",
      },
    },
    {
      action: actions.preview,
      item: {
        key: "preview",
        icon: "solar:eye-bold-duotone",
        label: "미리보기",
      },
    },
    {
      action: actions.rescan,
      item: {
        key: "rescan",
        icon: "solar:refresh-bold-duotone",
        label: "메타데이터 재스캔",
        iconClass: flags.isRescanning ? "animate-spin" : undefined,
      },
    },
    {
      action: actions.delete,
      item: {
        key: "delete",
        icon: "solar:trash-bin-trash-bold-duotone",
        label: "삭제",
        separatorBefore: true,
      },
    },
  ];

  return candidates
    .filter((candidate): candidate is Required<Candidate> => !!candidate.action)
    .map(({ action, item }) => ({ ...item, action }));
};
