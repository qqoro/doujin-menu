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
    version: "1.1.1",
    changes: [
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "다운로더에서 제목으로 검색이 되지 않던 문제를 수정했습니다.",
          "윈도우에서 폴더 이름이 이름 규칙에 적합하지 않게 생성되던 오류를 수정했습니다.",
        ],
      },
      {
        type: "etc",
        title: "기타",
        items: ["다운로더의 썸네일 모드에서 썸네일 크기를 키웠습니다."],
      },
    ],
  },
  {
    version: "1.1.0",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: [
          "라이브러리에서 책을 새 창으로 열 수 있는 기능이 추가되었습니다. (Ctrl+Click 또는 우클릭 메뉴)",
          "뷰어 창의 제목이 현재 열람중인 책의 제목으로 표시됩니다.",
        ],
      },
    ],
  },
  {
    version: "1.0.10",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: [
          "앱 잠금 기능이 추가되었습니다. (설정 > 일반 > 보안)",
          "읽음 기록 기능이 추가되었습니다. (메인 메뉴 > 열람 기록)",
          "뷰어에서 휠 클릭 시, 작업 표시줄까지 숨겨지는 전체 화면으로 전환됩니다. (엔터키는 기존과 동일)",
        ],
      },
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "라이브러리에서 한국어 제목이 올바르게 표시되지 않던 문제를 수정했습니다.",
        ],
      },
      {
        type: "etc",
        title: "기타",
        items: ["다운로더 화면에 태그 검색에 대한 안내 문구를 추가했습니다."],
      },
    ],
  },
  {
    version: "1.0.9",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: [
          "뷰어에 단축키 안내를 추가했습니다.",
          "뷰어에서 책의 상세 정보를 볼 수 있는 기능을 추가했습니다.",
        ],
      },
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "검색창 자동완성 목록에서 항목을 클릭해도 적용이 되지 않던 문제를 수정했습니다.",
          "작가를 기준으로 정렬했을 때 다음책으로 넘길 수 없던 문제를 수정했습니다.",
        ],
      },
    ],
  },
  {
    version: "1.0.8",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: [
          "다운로더 파일 이름 패턴에 `%groups%`를 추가했습니다.",
          "라이브러리에서 한국어 제목을 우선으로 표시하는 옵션을 추가했습니다.",
        ],
      },
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "더블 페이지 모드에서 페이지가 올바르게 표시되지 않던 문제를 수정했습니다.",
          "CBZ 형식의 파일을 지원합니다.",
        ],
      },
    ],
  },
  {
    version: "1.0.7",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: [
          "다운로드 완료 시 알림이 표시됩니다.",
          "다운로드 실패 시 자동으로 다시 시도합니다.",
        ],
      },
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "라이브러리에서 랜덤으로 책을 선택할 때, 검색 조건에 맞는 모든 책 중에서 선택되도록 수정되었습니다.",
          "압축파일의 썸네일 처리 시 발생하던 문제가 수정되었습니다.",
        ],
      },
    ],
  },
  {
    version: "1.0.6",
    changes: [
      {
        type: "feature",
        title: "✨ 새로운 기능",
        items: [
          "라이브러리 랜덤 기능 개선: 현재 필터링된 목록에서 랜덤 책을 선택하고, 뷰어 이동 시 검색/정렬 설정이 유지되도록 개선되었습니다.",
          "라이브러리 설정 유지 기능이 추가되었습니다.",
          "책 삭제 기능이 추가되었습니다.",
          "변경내역 알림 기능이 추가되었습니다.",
        ],
      },
      {
        type: "fix",
        title: "🐛 버그 수정",
        items: [
          "이미지 정렬 순서가 수정되었습니다.",
          "압축 파일 내 이미지 정렬이 개선되었습니다.",
          "뷰어 뒤로가기 버튼 동작이 수정되었습니다.",
          "다운로드 시 확장자 오류가 수정되었습니다.",
        ],
      },
    ],
  },
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
