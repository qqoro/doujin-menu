import { BrowserWindow, type WebContents } from "electron";
import type { IpcListenChannels } from "../../types/ipc.js";

// 페이로드가 void인 채널은 인자를 받지 않는다.
type BroadcastArgs<K extends keyof IpcListenChannels> =
  IpcListenChannels[K] extends void ? [] : [IpcListenChannels[K]];

/**
 * 열려 있는 모든 창에 메인 → 렌더러 이벤트를 보낸다.
 *
 * `webContents.send`를 직접 부르면 채널명과 페이로드가 전부 any로 빠져나가
 * 오타나 렌더러에 리스너가 없는 채널을 잡을 방법이 없다. 이 헬퍼를 거치면
 * `IpcListenChannels`에 선언되지 않은 채널은 컴파일되지 않는다.
 */
export function broadcast<K extends keyof IpcListenChannels>(
  channel: K,
  ...args: BroadcastArgs<K>
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, ...args);
  }
}

/**
 * 특정 창에만 이벤트를 보낸다. 요청을 보낸 렌더러에게만 진행률을 돌려주는
 * 경우(`event.sender`)처럼 대상이 정해져 있을 때 쓴다.
 */
export function sendTo<K extends keyof IpcListenChannels>(
  webContents: WebContents,
  channel: K,
  ...args: BroadcastArgs<K>
): void {
  webContents.send(channel, ...args);
}
