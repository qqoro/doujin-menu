export type PairResult = { ok: true } | { ok: false; message: string };

const PAIR_PARAM = "pair";

/** 이미 연결된 기기인지. QR을 다시 찍을 때 기기 목록에 같은 폰이 또 생기지 않게 한다 */
export async function hasSession(fetchFn: typeof fetch): Promise<boolean> {
  try {
    return (await fetchFn("/api/session")).status === 204;
  } catch {
    return false;
  }
}

export async function requestPairing(
  fetchFn: typeof fetch,
  clientId: string,
  code: string,
): Promise<PairResult> {
  try {
    const res = await fetchFn("/api/pair", {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-id": clientId },
      body: JSON.stringify({ code }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: body.error ?? `HTTP ${res.status}` };
  } catch {
    return { ok: false, message: "PC에 연결할 수 없습니다." };
  }
}

/** QR로 들어온 연결 코드를 꺼낸다. 성공과 상관없이 주소창에서는 지운다 */
export function takePairCode(
  href: string,
  replace: (url: string) => void,
): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(PAIR_PARAM)) return null;
  const code = url.searchParams.get(PAIR_PARAM);
  url.searchParams.delete(PAIR_PARAM);
  replace(url.toString());
  return code || null;
}

export function withPairCode(url: string, code: string): string {
  const next = new URL(url);
  next.searchParams.set(PAIR_PARAM, code);
  return next.toString();
}
