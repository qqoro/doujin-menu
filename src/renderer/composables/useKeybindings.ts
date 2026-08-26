import { useThrottleFn } from "@vueuse/core";
import type { KeybindingContext } from "../lib/keybindings/types";
import { normalizeKey, isInputFocused } from "../lib/keybindings/utils";
import { hasOpenDialog } from "../lib/utils";
import { useKeybindingStore } from "../store/keybindingStore";
import { useWindowEvent } from "./useWindowEvent";

interface UseKeybindingsOptions {
  // 스로틀 간격 (ms). 0이면 스로틀 없음.
  throttle?: number;
}

export function useKeybindings(
  context: KeybindingContext,
  handlers: Record<string, (e: KeyboardEvent) => void | Promise<void>>,
  options: UseKeybindingsOptions = {},
) {
  const store = useKeybindingStore();

  const handleKeyDown = (e: KeyboardEvent) => {
    // 1. 다이얼로그 열려있으면 무시 (Reka UI에 위임)
    if (hasOpenDialog()) return;

    // 2. 입력 요소 포커스 중이면 무시
    if (isInputFocused(e)) return;

    // 3. 누른 키 정규화
    const pressedKey = normalizeKey(e);

    // 4. 현재 컨텍스트에서 매칭되는 액션 찾기
    const action = store.findActionByKey(context, pressedKey);
    if (!action) return;

    // 5. 핸들러 실행
    const handler = handlers[action.id];
    if (handler) {
      e.preventDefault();
      // global 컨텍스트와 중복 실행 방지
      e.stopImmediatePropagation();
      handler(e);
    }
  };

  // 스로틀 적용 여부
  const { throttle } = options;
  if (throttle && throttle > 0) {
    useWindowEvent("keydown", useThrottleFn(handleKeyDown, throttle, true));
  } else {
    useWindowEvent("keydown", handleKeyDown);
  }
}
