import crypto from "crypto";

export const CODE_TTL_MS = 5 * 60_000;
export const FAILURE_WINDOW_MS = 60_000;
export const MAX_FAILURES = 5;
// PC의 모바일 페이지는 5초마다 상태를 확인한다. 여유를 두고 그 뒤 30초까지만 받는다
export const PAIRING_WINDOW_MS = 30_000;

export type PairAttempt = "ok" | "invalid" | "rate-limited" | "closed";

export interface PairingCodes {
  current(): { code: string; expiresAt: number };
  /** PC의 모바일 페이지가 열려 있다는 신호. 이때만 페어링을 받는다 */
  arm(): void;
  attempt(code: string): PairAttempt;
}

const randomCode = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/**
 * PC 화면에 보여 주는 6자리 연결 코드. 메인 프로세스 메모리에만 있다.
 * Funnel이면 인터넷에 공개되므로 잘못된 시도는 기기 구분 없이 전역으로 제한한다.
 * 그것만으로는 1분 5회씩 몇 달 두드리면 뚫리므로, 코드가 보이는 PC 페이지가
 * 열려 있을 때만 받는다.
 */
export function createPairingCodes(deps?: {
  now?: () => number;
  generate?: () => string;
}): PairingCodes {
  const now = deps?.now ?? Date.now;
  const generate = deps?.generate ?? randomCode;
  let code = "";
  let expiresAt = 0;
  let failures: number[] = [];
  let armedAt: number | null = null;

  const rotate = () => {
    code = generate();
    expiresAt = now() + CODE_TTL_MS;
  };

  const current = () => {
    if (now() >= expiresAt) rotate();
    return { code, expiresAt };
  };

  const attempt = (input: string): PairAttempt => {
    const t = now();
    if (armedAt === null || t - armedAt >= PAIRING_WINDOW_MS) return "closed";
    failures = failures.filter((at) => t - at < FAILURE_WINDOW_MS);
    if (failures.length >= MAX_FAILURES) return "rate-limited";
    if (!/^\d{6}$/.test(input) || input !== current().code) {
      failures.push(t);
      return "invalid";
    }
    rotate();
    return "ok";
  };

  const arm = () => {
    armedAt = now();
  };

  return { current, arm, attempt };
}
