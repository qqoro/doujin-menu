import { useThrottleFn } from "@vueuse/core";
import type { KeybindingContext } from "../lib/keybindings/types";
import { normalizeKey, isInputFocused } from "../lib/keybindings/utils";
import { hasOpenDialog } from "../lib/utils";
import { useKeybindingStore } from "../store/keybindingStore";
import { useWindowEvent } from "./useWindowEvent";

interface UseKeybindingsOptions {
  // 스로틀 간격 (ms). 0이면 스로틀 없음.
  throttle?: number;
  /**
   * false를 돌려주면 이 컨텍스트의 키를 아예 보지 않는다.
   *
   * keep-alive로 살아 있는 페이지는 비활성 상태에서도 리스너가 남아 있다.
   * 방향키처럼 다른 화면에서도 뜻이 있는 키를 그대로 두면 스크롤이 막힌다.
   */
  enabled?: () => boolean;
}

/**
 * 핸들러가 `false`를 반환하면 "이번엔 처리하지 않았다"는 뜻이다. 기본 동작도
 * 막지 않고 뒤에 걸린 다른 컨텍스트로 그대로 넘긴다. Escape처럼 하나의 키를
 * 상황에 따라 나눠 써야 할 때 쓴다 (포커스가 있으면 해제, 없으면 창 최소화).
 */
type KeybindingHandler = (e: KeyboardEvent) => void | boolean | Promise<void>;

export function useKeybindings(
  context: KeybindingContext,
  handlers: Record<string, KeybindingHandler>,
  options: UseKeybindingsOptions = {},
) {
  const store = useKeybindingStore();

  const handleKeyDown = (e: KeyboardEvent) => {
    // 0. 비활성 페이지의 컨텍스트는 건너뛴다
    if (options.enabled && !options.enabled()) return;

    // 1. 다이얼로그 열려있으면 무시 (Reka UI에 위임)
    if (hasOpenDialog()) return;

    // 2. 입력 요소 포커스 중이면 무시
    if (isInputFocused(e)) return;

    // 3. 누른 키 정규화
    const pressedKey = normalizeKey(e);

    // 4. 현재 컨텍스트에서 매칭되는 액션 찾기
    const action = store.findActionByKey(context, pressedKey);
    if (!action) return;

    // 5. 핸들러 실행. false를 반환하면 처리하지 않은 것으로 보고 그대로 흘려보낸다
    const handler = handlers[action.id];
    if (handler) {
      if (handler(e) === false) return;
      e.preventDefault();
      // global 컨텍스트와 중복 실행 방지
      e.stopImmediatePropagation();
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
