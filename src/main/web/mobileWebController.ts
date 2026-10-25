import { ipcMain } from "electron";
import log from "electron-log";
import Store from "electron-store";
import os from "os";
import { store } from "../handlers/configHandler.js";
import type { MobileWebStatus } from "../../types/ipc.js";
import {
  createDeviceRegistry,
  type DeviceRegistry,
  type StoredMobileDevice,
} from "./deviceRegistry.js";
import {
  findDefaultRouteAddress,
  pickLanAddresses,
  selectLanAddress,
} from "./network.js";
import { createPairingCodes } from "./pairing.js";
import {
  startWebServer,
  type RendererSource,
  type WebAuth,
  type WebServerHandle,
} from "./server.js";
import { getTailscaleInfo } from "./tailscale.js";

const DEFAULT_PORT = 47900;

let handle: WebServerHandle | null = null;
let lastError: string | null = null;
let renderer: RendererSource | null = null;
let roots: string[] = [];
let registry: DeviceRegistry | null = null;
// 설정이 연달아 바뀌어도 시작/종료가 겹치지 않게 순서대로 처리한다
let pending: Promise<void> = Promise.resolve();

const codes = createPairingCodes();

/** set-config는 값의 타입을 보지 않으므로 여기서 정수 포트만 통과시킨다 */
export function normalizePort(value: unknown): number {
  const port = typeof value === "string" ? Number(value) : value;
  return typeof port === "number" &&
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65535
    ? port
    : DEFAULT_PORT;
}

const currentPort = () => normalizePort(store.get("mobileWebPort"));

export function parseCustomOrigin(
  value: string | undefined,
): { hostname: string; secure: boolean } | null {
  try {
    const url = new URL(value?.trim() ?? "");
    return {
      hostname: url.hostname.toLowerCase(),
      secure: url.protocol === "https:",
    };
  } catch {
    return null;
  }
}

export function describeStartError(err: unknown, port: number): string {
  if ((err as NodeJS.ErrnoException | null)?.code === "EADDRINUSE") {
    return `포트 ${port}을(를) 이미 사용 중입니다.`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return `모바일 웹 서버를 시작하지 못했습니다: ${message}`;
}

// 기기 목록은 앱 설정과 다른 파일에 둔다. 같은 파일이면 폰이 set-config로 자기 토큰을 끼워 넣을 수 있다
const getRegistry = (): DeviceRegistry => {
  if (!registry) {
    const deviceStore = new Store<{ devices: StoredMobileDevice[] }>({
      name: "mobile-devices",
      defaults: { devices: [] },
    });
    registry = createDeviceRegistry({
      load: () => deviceStore.get("devices"),
      save: (devices) => deviceStore.set("devices", devices),
    });
  }
  return registry;
};

const auth: WebAuth = {
  verify: (token) => getRegistry().verify(token)?.id ?? null,
  pair: (code, info) => {
    const result = codes.attempt(code);
    if (result !== "ok") return { ok: false, reason: result };
    return { ok: true, token: getRegistry().add(info).token };
  },
};

async function apply(): Promise<void> {
  if (handle) {
    await handle.close();
    handle = null;
  }
  lastError = null;
  if (!store.get("mobileWebEnabled") || !renderer) return;

  const port = currentPort();
  try {
    handle = await startWebServer({
      port,
      host: "0.0.0.0",
      renderer,
      mediaRoots: roots,
      auth,
      customOrigin: () => parseCustomOrigin(store.get("mobileWebUrl")),
    });
    log.info(`[MobileWeb] 포트 ${handle.port}에서 대기 중`);
  } catch (error) {
    lastError = describeStartError(error, port);
    log.error("[MobileWeb]", lastError);
  }
}

const schedule = () => {
  pending = pending.then(apply);
};

export function initMobileWeb(
  rendererSource: RendererSource,
  mediaRoots: string[],
): void {
  renderer = rendererSource;
  roots = mediaRoots;
  schedule();
  store.onDidChange("mobileWebEnabled", schedule);
  store.onDidChange("mobileWebPort", schedule);
}

export async function stopMobileWeb(): Promise<void> {
  await pending;
  await handle?.close();
  handle = null;
}

/** PC의 모바일 페이지만 부르는 채널(PC 전용)이므로, 불렸다면 그 페이지가 열려 있다 */
export async function getMobileWebStatus(): Promise<MobileWebStatus> {
  await pending;
  codes.arm();
  const port = currentPort();
  const addresses = pickLanAddresses(os.networkInterfaces());
  const selected = selectLanAddress(
    addresses,
    store.get("mobileWebLanAddress"),
    await findDefaultRouteAddress(),
  );
  const customUrl = store.get("mobileWebUrl")?.trim() || null;
  return {
    enabled: !!store.get("mobileWebEnabled"),
    port,
    running: handle !== null,
    error: lastError,
    lan: {
      addresses,
      selected,
      url: selected ? `http://${selected}:${port}/` : null,
    },
    tailscale: await getTailscaleInfo(port),
    customUrl,
    pairing: handle ? codes.current() : null,
    devices: getRegistry().list(),
  };
}

export function revokeMobileDevice(id: string): {
  success: boolean;
  error?: string;
} {
  if (!getRegistry().remove(id)) {
    return { success: false, error: "이미 해제된 기기입니다." };
  }
  handle?.disconnectDevice(id);
  return { success: true };
}

export function registerMobileWebHandlers(): void {
  ipcMain.handle("get-mobile-web-status", () => getMobileWebStatus());
  ipcMain.handle("revoke-mobile-device", (_event, id: string) =>
    revokeMobileDevice(id),
  );
  ipcMain.handle("get-mobile-web-running", () => handle !== null);
}
