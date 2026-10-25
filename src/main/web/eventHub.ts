/**
 * 모바일 웹 클라이언트로 보내는 메인 → 렌더러 이벤트(SSE).
 * 창에 `webContents.send`로 가는 이벤트를 같은 모양의 JSON 프레임으로 내보낸다.
 */
export interface WebEventClient {
  id: string;
  write(chunk: string): void;
}

const clients = new Map<string, Set<WebEventClient>>();

const frame = (channel: string, payload: unknown) =>
  `data: ${JSON.stringify({ channel, payload })}\n\n`;

export function addWebClient(client: WebEventClient): () => void {
  let group = clients.get(client.id);
  if (!group) {
    group = new Set();
    clients.set(client.id, group);
  }
  group.add(client);

  return () => {
    group.delete(client);
    if (group.size === 0) clients.delete(client.id);
  };
}

export function publishWeb(channel: string, payload?: unknown): void {
  const chunk = frame(channel, payload);
  for (const group of clients.values()) {
    for (const client of group) client.write(chunk);
  }
}

export function publishWebTo(
  clientId: string,
  channel: string,
  payload?: unknown,
): void {
  const group = clients.get(clientId);
  if (!group) return;
  const chunk = frame(channel, payload);
  for (const client of group) client.write(chunk);
}

/**
 * 핸들러가 `event.sender`로 받는 대체 객체. `sendTo(event.sender, ...)`가
 * 요청한 휴대폰에만 진행률을 돌려주게 된다.
 */
export function createWebSender(clientId: string): {
  send(channel: string, ...args: unknown[]): void;
} {
  return {
    send: (channel, ...args) => publishWebTo(clientId, channel, args[0]),
  };
}
