import type { MobileRoute } from "../../types/ipc";

export const ROUTE_LABELS: Record<MobileRoute, string> = {
  lan: "와이파이",
  tailscale: "Tailscale",
  custom: "직접 입력 주소",
  local: "이 PC",
};

/** 직접 입력 주소는 QR과 서버의 Host 허용에 쓰이므로 스킴까지 갖춘 주소여야 한다 */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export const formatPairCode = (code: string) =>
  `${code.slice(0, 3)} ${code.slice(3)}`;

export function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatRelativeTime(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
