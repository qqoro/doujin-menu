// 수식키 목록 (단독 입력 감지용)
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

// 키보드 이벤트를 정규화된 문자열로 변환
export function normalizeKey(e: KeyboardEvent): string {
  // 수식키 단독 입력은 그대로 반환
  if (MODIFIER_KEYS.has(e.key)) return e.key;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  // Shift는 비인쇄 키(Delete, F1, Arrow 등)에만 추가
  // 인쇄 가능 문자는 e.key가 이미 Shift 상태를 반영 (예: Shift+[ → {)
  if (e.shiftKey && e.key.length > 1) parts.push("Shift");

  let key = e.key;
  // 영문 단일 문자는 소문자로 통일 → CapsLock 문제 해결
  if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    key = key.toLowerCase();
  }

  parts.push(key);
  return parts.join("+");
}

// 입력 요소에 포커스가 있는지 확인
export function isInputFocused(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" || tagName === "textarea" || target.isContentEditable
  );
}

// 수식키 단독 입력인지 확인
export function isModifierOnly(e: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(e.key);
}

// 내부 키 값을 UI 표시용 라벨로 변환
const KEY_LABELS: Record<string, string> = {
  ArrowRight: "→",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  Delete: "Del",
  " ": "Space",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Enter: "Enter",
};

export function getKeyLabel(normalizedKey: string): string {
  // 수식키 + 메인키 분리
  const parts = normalizedKey.split("+");
  const mainKey = parts.pop()!;
  const modifiers = parts;

  // 메인키 라벨 변환
  let label = KEY_LABELS[mainKey] ?? mainKey;
  // 단일 영문자는 대문자로 표시
  if (label.length === 1 && /[a-z]/.test(label)) {
    label = label.toUpperCase();
  }

  return [...modifiers, label].join("+");
}
