import { isRef, toRaw } from "vue";

/**
 * Vue 프록시를 벗겨 구조화 복제가 가능한 값으로 바꿉니다.
 *
 * IPC는 V8 구조화 복제로 인자를 넘기는데, 복제기는 Proxy를 만나면
 * "An object could not be cloned."로 죽습니다. `ref`/`reactive`가 씌우는 게 바로 그 Proxy라
 * 반응형 객체를 그대로 invoke에 넘기면 채널이 무엇이든 터집니다.
 *
 * `toRaw`는 한 겹만 벗기므로 `[...arr]`나 `toRaw(arr)`로는 원소가 프록시로 남습니다.
 * 그래서 여기서 재귀로 훑습니다.
 */
export const toCloneable = <T>(value: T): T => convert(value, new Map()) as T;

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const convert = (input: unknown, seen: Map<object, unknown>): unknown => {
  const unwrapped = isRef(input) ? input.value : input;
  if (unwrapped === null || typeof unwrapped !== "object") return unwrapped;

  const raw = toRaw(unwrapped) as object;
  // 순환 참조. 구조화 복제는 이걸 처리하므로 여기서 끊어지면 안 됩니다.
  if (seen.has(raw)) return seen.get(raw);

  if (Array.isArray(raw)) {
    const next: unknown[] = [];
    seen.set(raw, next);
    for (const item of raw) next.push(convert(item, seen));
    return next;
  }

  if (isPlainObject(raw)) {
    const next: Record<string, unknown> = {};
    seen.set(raw, next);
    for (const [key, item] of Object.entries(raw)) {
      next[key] = convert(item, seen);
    }
    return next;
  }

  // Date, Uint8Array처럼 복제기가 그대로 다루는 값은 건드리지 않습니다.
  // 복제할 수 없는 값(클래스 인스턴스, 함수)도 그대로 둬서 원래 오류가 그대로 나게 합니다.
  return raw;
};
