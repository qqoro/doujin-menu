/**
 * 휴대폰에서 마지막으로 고른 자동 넘김 간격.
 * electron-store에 저장하면 PC의 간격까지 바뀌므로 브라우저 저장소에 둔다.
 */
export const LAST_INTERVAL_KEY = "mobile.lastAutoPlayInterval";

export function readLastInterval(
  storage: Pick<Storage, "getItem"> | null,
): number | null {
  try {
    const value = Number(storage?.getItem(LAST_INTERVAL_KEY));
    return Number.isInteger(value) && value >= 1 && value <= 9 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastInterval(
  storage: Pick<Storage, "setItem"> | null,
  seconds: number,
): void {
  try {
    storage?.setItem(LAST_INTERVAL_KEY, String(seconds));
  } catch {
    // 저장을 못 해도 이번 재생에는 지장이 없다
  }
}
