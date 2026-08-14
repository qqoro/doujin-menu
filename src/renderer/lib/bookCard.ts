/**
 * 책 카드의 순수 계산.
 *
 * `BookCard`와 `BookRowCard`가 각자 들고 있던 것들이다. 컴포넌트 밖으로 빼면
 * 두 카드가 같은 결과를 내는 것이 보장되고 단위 테스트가 붙는다.
 */

import type { MetaField, MetaPart } from "./cardLayout";
import { formatPublishDate } from "./formatDate";

export interface NamedItem {
  name: string;
}

/**
 * 이름이 비어 있는 항목을 걸러낸다.
 *
 * 메타데이터가 없는 책은 `[{ name: "" }]`처럼 빈 이름이 들어오는 경우가 있어서
 * 길이만 보고 판단하면 화면에 빈 칩이 그려진다.
 */
export const filterValidNames = <T extends NamedItem>(
  items: T[] | null | undefined,
): T[] =>
  (items ?? []).filter((item) => !!item?.name && item.name.trim() !== "");

/**
 * 표지 이미지 URL.
 *
 * `version`은 캐시 무효화용이다. 메타데이터 재스캔으로 썸네일 파일이 같은 경로에
 * 새로 쓰이면 브라우저가 옛 이미지를 그대로 보여주므로 쿼리로 강제 갱신한다.
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

/**
 * 메타 한 줄에 필요한 최소 모양.
 *
 * `Book` 전체를 받지 않는 이유는 테스트에서 책 한 권을 통째로 만들지 않기
 * 위해서다. 이 함수가 읽는 건 아래 여섯 개뿐이다.
 */
export interface BookMetaSource {
  page_count?: number;
  type?: string;
  language_name_local?: string;
  language_name_english?: string;
  added_at?: string;
  hitomi_id?: string;
}

/**
 * `·`으로 이어붙일 메타 조각들을 만든다.
 *
 * 다운로더의 `buildMetaLine`과 같은 모양(`MetaPart[]`)을 내보내 같은 `MetaLine`
 * 컴포넌트가 그린다. 원본 필드가 서로 달라(갤러리는 `files`/`publishedDate`,
 * 책은 `page_count`/`added_at`) 함수만 화면별로 둔다.
 *
 * 값이 없는 항목은 자리를 남기지 않고 통째로 빠진다. 안 그러면 정보가 적은
 * 책에서 `· · ·`만 남은 줄이 나온다.
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

// ── 카드 메뉴 ───────────────────────────────────────────────────────

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

export type BookMenuActions = Record<
  | "favorite"
  | "folder"
  | "newWindow"
  | "external"
  | "details"
  | "preview"
  | "rescan"
  | "delete",
  () => void
>;

/**
 * 카드 메뉴 항목.
 *
 * **우클릭 메뉴와 ⋮ 드롭다운이 같은 배열을 그린다.** Reka UI는 두 메뉴의 항목
 * 컴포넌트가 달라서(`ContextMenuItem` / `DropdownMenuItem`) 마크업은 따로
 * 가져가야 하는데, 항목 정의까지 따로 두면 한쪽만 고쳐져 두 메뉴가 갈라진다.
 */
export const buildBookMenuItems = (
  flags: BookMenuFlags,
  actions: BookMenuActions,
): BookMenuItem[] => {
  const items: BookMenuItem[] = [
    {
      key: "favorite",
      icon: flags.isFavorite
        ? "solar:heart-broken-line-duotone"
        : "solar:heart-bold-duotone",
      label: flags.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가",
      action: actions.favorite,
    },
    {
      key: "folder",
      icon: "solar:folder-open-bold-duotone",
      label: "폴더 열기",
      action: actions.folder,
    },
    {
      key: "new-window",
      icon: "solar:square-top-down-bold-duotone",
      label: "새 창으로 열기",
      action: actions.newWindow,
    },
  ];

  // 외부 뷰어 경로가 설정돼 있을 때만 노출한다
  if (flags.hasExternalViewer) {
    items.push({
      key: "external",
      icon: "solar:monitor-bold-duotone",
      label: "외부 프로그램으로 열기",
      action: actions.external,
    });
  }

  items.push(
    {
      key: "details",
      icon: "solar:info-circle-bold-duotone",
      label: "상세 정보",
      action: actions.details,
    },
    {
      key: "preview",
      icon: "solar:eye-bold-duotone",
      label: "미리보기",
      action: actions.preview,
    },
    {
      key: "rescan",
      icon: "solar:refresh-bold-duotone",
      label: "메타데이터 재스캔",
      iconClass: flags.isRescanning ? "animate-spin" : undefined,
      action: actions.rescan,
    },
    {
      key: "delete",
      icon: "solar:trash-bin-trash-bold-duotone",
      label: "삭제",
      separatorBefore: true,
      action: actions.delete,
    },
  );

  return items;
};
