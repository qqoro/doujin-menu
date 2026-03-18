import type { ActionDefinition } from "./types";

export const defaultActions: ActionDefinition[] = [
  // === 뷰어 ===
  {
    id: "viewer:next-page",
    description: "다음 페이지",
    context: "viewer",
    defaultKeys: ["ArrowRight", "ArrowDown", "PageDown", " "],
  },
  {
    id: "viewer:prev-page",
    description: "이전 페이지",
    context: "viewer",
    defaultKeys: ["ArrowLeft", "ArrowUp", "PageUp"],
  },
  {
    id: "viewer:first-page",
    description: "첫 페이지",
    context: "viewer",
    defaultKeys: ["Home"],
  },
  {
    id: "viewer:last-page",
    description: "마지막 페이지",
    context: "viewer",
    defaultKeys: ["End"],
  },
  {
    id: "viewer:next-book",
    description: "다음 책",
    context: "viewer",
    defaultKeys: ["]"],
  },
  {
    id: "viewer:prev-book",
    description: "이전 책",
    context: "viewer",
    defaultKeys: ["["],
  },
  {
    id: "viewer:next-series",
    description: "시리즈 다음 권",
    context: "viewer",
    defaultKeys: ["}"],
  },
  {
    id: "viewer:prev-series",
    description: "시리즈 이전 권",
    context: "viewer",
    defaultKeys: ["{"],
  },
  {
    id: "viewer:random-book",
    description: "랜덤 책",
    context: "viewer",
    defaultKeys: ["\\"],
  },
  {
    id: "viewer:toggle-auto-next",
    description: "자동 다음 책 토글",
    context: "viewer",
    defaultKeys: ["a"],
  },
  {
    id: "viewer:zoom-in",
    description: "확대",
    context: "viewer",
    defaultKeys: ["+", "="],
  },
  {
    id: "viewer:zoom-out",
    description: "축소",
    context: "viewer",
    defaultKeys: ["-", "_"],
  },
  {
    id: "viewer:zoom-reset",
    description: "확대/축소 초기화",
    context: "viewer",
    defaultKeys: ["0"],
  },
  {
    id: "viewer:auto-flip-1",
    description: "자동 넘김 1초",
    context: "viewer",
    defaultKeys: ["Ctrl+1"],
  },
  {
    id: "viewer:auto-flip-2",
    description: "자동 넘김 2초",
    context: "viewer",
    defaultKeys: ["Ctrl+2"],
  },
  {
    id: "viewer:auto-flip-3",
    description: "자동 넘김 3초",
    context: "viewer",
    defaultKeys: ["Ctrl+3"],
  },
  {
    id: "viewer:auto-flip-4",
    description: "자동 넘김 4초",
    context: "viewer",
    defaultKeys: ["Ctrl+4"],
  },
  {
    id: "viewer:auto-flip-5",
    description: "자동 넘김 5초",
    context: "viewer",
    defaultKeys: ["Ctrl+5"],
  },
  {
    id: "viewer:auto-flip-6",
    description: "자동 넘김 6초",
    context: "viewer",
    defaultKeys: ["Ctrl+6"],
  },
  {
    id: "viewer:auto-flip-7",
    description: "자동 넘김 7초",
    context: "viewer",
    defaultKeys: ["Ctrl+7"],
  },
  {
    id: "viewer:auto-flip-8",
    description: "자동 넘김 8초",
    context: "viewer",
    defaultKeys: ["Ctrl+8"],
  },
  {
    id: "viewer:auto-flip-9",
    description: "자동 넘김 9초",
    context: "viewer",
    defaultKeys: ["Ctrl+9"],
  },
  {
    id: "viewer:auto-flip-stop",
    description: "자동 넘김 중지",
    context: "viewer",
    defaultKeys: ["Ctrl+0"],
  },
  {
    id: "viewer:book-info",
    description: "책 정보 보기/숨기기",
    context: "viewer",
    defaultKeys: ["`"],
  },
  {
    id: "viewer:delete-book",
    description: "현재 책 삭제",
    context: "viewer",
    defaultKeys: ["Shift+Delete"],
  },
  {
    id: "viewer:escape",
    description: "라이브러리로 돌아가기",
    context: "viewer",
    defaultKeys: ["Escape"],
  },
  {
    id: "viewer:maximize-toggle",
    description: "창 최대화/원래 크기",
    context: "viewer",
    defaultKeys: ["Enter"],
  },
  {
    id: "viewer:fullscreen",
    description: "전체화면 전환",
    context: "viewer",
    defaultKeys: ["F11"],
  },

  // === 라이브러리 ===
  {
    id: "library:search-focus",
    description: "검색창 포커스",
    context: "library",
    defaultKeys: ["Ctrl+f"],
  },

  // === 레이아웃 ===
  {
    id: "layout:fullscreen",
    description: "전체화면 전환",
    context: "layout",
    defaultKeys: ["F11"],
  },
  {
    id: "layout:minimize",
    description: "창 최소화",
    context: "layout",
    defaultKeys: ["Escape"],
  },

  // === 다운로더 ===
  {
    id: "downloader:preview-toggle",
    description: "미리보기 토글",
    context: "downloader",
    defaultKeys: ["v"],
  },

  // === 전역 ===
  {
    id: "global:refresh",
    description: "페이지 새로고침",
    context: "global",
    defaultKeys: ["Ctrl+r", "F5"],
  },
  {
    id: "global:close-window",
    description: "창 닫기",
    context: "global",
    defaultKeys: ["Ctrl+w"],
  },
];
