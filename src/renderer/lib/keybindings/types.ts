// 단축키가 적용되는 컨텍스트 (페이지/범위)
export type KeybindingContext =
  | "viewer"
  | "library"
  | "layout"
  | "downloader"
  | "global";

// 기본 액션 정의 (defaults.ts에서 사용)
export interface ActionDefinition {
  id: string;
  description: string;
  context: KeybindingContext;
  defaultKeys: string[];
}

// 사용자 오버라이드 (electron-store에 저장)
export interface KeybindingOverride {
  actionId: string;
  keys: string[];
}

// 기본값 + 오버라이드 병합 결과
export interface ResolvedBinding extends ActionDefinition {
  keys: string[]; // 오버라이드가 있으면 오버라이드, 없으면 defaultKeys
  isModified: boolean; // 사용자가 변경했는지 여부
}
