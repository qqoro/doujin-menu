export interface Change {
  type: "feature" | "fix" | "refactor" | "etc";
  title: string;
  items: string[];
}

export interface Changelog {
  version: string;
  changes: Change[];
}

/**
 * 버전별 변경 내역 데이터.
 * 최신 버전이 배열의 가장 위에 위치해야 합니다.
 */
export const changelogData: Changelog[] = [
  {
    version: "1.0.5",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: ["정규식을 이용한 누락된 info.txt 처리 기능이 추가되었습니다."],
      },
    ],
  },
  {
    version: "1.0.4",
    changes: [
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: ["긴 파일 경로를 처리하지 못하던 문제를 수정했습니다."],
      },
      {
        type: "etc",
        title: "기타",
        items: ["다운로더 단축키 간섭 문제를 수정했습니다."],
      },
    ],
  },
  {
    version: "1.0.3",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: [
          "라이브러리 스캔 후 한꺼번에 처리하도록 변경하여 성능을 개선했습니다.",
          "뷰어에서 ESC 키를 눌러 나갈 때 검색값을 유지하도록 수정했습니다.",
        ],
      },
    ],
  },
  {
    version: "1.0.2",
    changes: [
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "라이브러리 폴더 삭제 시 책 데이터를 삭제하도록 수정했습니다.",
          "하위 폴더 탐색 시 발생하는 버그를 수정했습니다.",
        ],
      },
    ],
  },
  {
    version: "1.0.1",
    changes: [
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "앱 자동 업데이트 로직을 수정했습니다.",
          "불필요한 의존성을 제거했습니다.",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: ["최초 버전을 출시했습니다."],
      },
    ],
  },
] as const;

/**
 * 특정 버전 또는 최신 버전의 변경 내역을 가져옵니다.
 * @param version 가져올 버전. 지정하지 않으면 최신 버전을 반환합니다.
 * @returns 버전과 변경 내역을 담은 객체. 없으면 null을 반환합니다.
 */
export function getChangelog(version?: string): Changelog | null {
  if (version) {
    return changelogData.find((item) => item.version === version) || null;
  }
  return changelogData[0] || null;
}
