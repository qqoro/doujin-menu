/**
 * 웹 클라이언트 구분용 id. `crypto.randomUUID`는 보안 컨텍스트(HTTPS)에만 있어서
 * 와이파이(HTTP) 접속에서는 없다. getRandomValues는 어디서나 된다.
 */
export function createClientId(
  source: Pick<Crypto, "getRandomValues"> = crypto,
): string {
  const bytes = source.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
