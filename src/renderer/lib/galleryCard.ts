/**
 * 다운로더 카드의 상태·메타·치수 계산.
 *
 * 그리드 카드와 리스트 카드가 같은 판정을 각자 복붙하고 있어서 두 뷰의 표현이
 * 계속 갈라졌습니다. 판정은 전부 여기에 모으고, 컴포넌트에는 그리는 일만
 * 남깁니다. DOM을 모르는 순수 함수라 컴포넌트 마운트 없이 테스트합니다.
 */

import type { MetaField, MetaPart } from "./cardLayout";
import { formatPublishDate } from "./formatDate";

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
 * 카드 상태를 하나로 판정합니다.
 *
 * **우선순위가 있습니다.** 보유중이 가장 셉니다. 라이브러리에 이미 있는 책은
 * 큐에 실패 기록이 남아 있어도 사용자에겐 "가지고 있는 책"입니다. 예전에는
 * 완료 배경색과 실패 배경색이 동시에 걸려 CSS 선언 순서가 승자를 정했습니다.
 *
 * `badgeLabel`과 `buttonLabel`을 한 함수에서 내는 이유는 어휘를 하나로 묶기
 * 위해서입니다. 따로 두면 배지는 "대기", 버튼은 "대기 중"처럼 갈라집니다.
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

// ── 메타 한 줄 ──────────────────────────────────────────────────────

/**
 * 메타 한 줄에 필요한 최소 모양.
 *
 * `Gallery` 전체를 받지 않는 이유는 테스트에서 갤러리 한 건을 통째로 만들지
 * 않기 위해서입니다. 이 함수가 실제로 읽는 건 아래 다섯 개뿐입니다.
 */
export interface MetaSource {
  id: number;
  type?: string;
  files?: unknown[];
  /** node-hitomi는 현지어 이름이 없는 언어에 null을 담습니다 */
  languageName?: { local?: string | null; english?: string | null } | null;
  publishedDate?: Date | string | number | null;
}

/**
 * `·`으로 이어붙일 메타 조각들을 만듭니다.
 *
 * 그리드와 리스트가 **같은 함수에 다른 필드 목록**을 넘깁니다. 문자열 하나로
 * 합쳐서 돌려주지 않는 이유는 `#ID`만 클릭 복사가 되어야 하기 때문입니다.
 * 구분자는 컴포넌트가 넣습니다.
 *
 * 값이 없는 항목은 자리를 남기지 않고 통째로 빠집니다. 안 그러면 정보가 적은
 * 작품에서 `· · ·`만 남은 줄이 나옵니다.
 */
export const buildMetaLine = (
  gallery: MetaSource,
  fields: MetaField[],
): MetaPart[] => {
  const parts: MetaPart[] = [];

  for (const key of fields) {
    switch (key) {
      case "pages": {
        const count = gallery.files?.length ?? 0;
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
        const text = formatPublishDate(gallery.publishedDate);
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
