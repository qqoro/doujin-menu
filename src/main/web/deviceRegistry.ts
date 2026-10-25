import crypto from "crypto";
import type { MobileDeviceInfo, MobileRoute } from "../../types/ipc.js";

export interface StoredMobileDevice extends MobileDeviceInfo {
  tokenHash: string;
}

export interface DeviceBackend {
  load(): StoredMobileDevice[];
  save(devices: StoredMobileDevice[]): void;
}

export interface DeviceRegistry {
  add(info: { userAgent: string; route: MobileRoute }): {
    device: MobileDeviceInfo;
    token: string;
  };
  verify(token: string): MobileDeviceInfo | null;
  list(): MobileDeviceInfo[];
  remove(id: string): boolean;
}

// 요청마다 설정 파일을 쓰지 않도록 마지막 접속 시각은 이 간격으로만 저장한다
export const LAST_SEEN_WRITE_MS = 60_000;

export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const PLATFORMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Macintosh/, "Mac"],
];

// 다른 브라우저 이름을 함께 싣는 UA가 많아서 순서가 중요하다
const BROWSERS: [RegExp, string][] = [
  [/SamsungBrowser\//, "삼성 인터넷"],
  [/Edg(A|iOS)?\//, "Edge"],
  [/(Chrome|CriOS)\//, "Chrome"],
  [/(Firefox|FxiOS)\//, "Firefox"],
  [/Safari\//, "Safari"],
];

export function describeUserAgent(userAgent: string): string {
  const platform = PLATFORMS.find(([re]) => re.test(userAgent))?.[1];
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  if (platform && browser) return `${platform} · ${browser}`;
  return platform ?? browser ?? "알 수 없는 기기";
}

const toInfo = ({
  tokenHash: _hash,
  ...info
}: StoredMobileDevice): MobileDeviceInfo => info;

const sameHash = (a: string, b: string) =>
  a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export function createDeviceRegistry(
  backend: DeviceBackend,
  deps?: { now?: () => number; randomToken?: () => string },
): DeviceRegistry {
  const now = deps?.now ?? Date.now;
  const randomToken =
    deps?.randomToken ?? (() => crypto.randomBytes(32).toString("base64url"));
  let devices = backend.load();

  const commit = (next: StoredMobileDevice[]) => {
    devices = next;
    backend.save(devices);
  };

  return {
    add({ userAgent, route }) {
      const token = randomToken();
      const t = now();
      const device: StoredMobileDevice = {
        id: crypto.randomUUID(),
        name: describeUserAgent(userAgent),
        route,
        createdAt: t,
        lastSeenAt: t,
        tokenHash: hashToken(token),
      };
      commit([...devices, device]);
      return { device: toInfo(device), token };
    },
    verify(token) {
      if (!token) return null;
      const hash = hashToken(token);
      const device = devices.find((d) => sameHash(d.tokenHash, hash));
      if (!device) return null;
      const t = now();
      if (t - device.lastSeenAt > LAST_SEEN_WRITE_MS) {
        commit(
          devices.map((d) =>
            d.id === device.id ? { ...d, lastSeenAt: t } : d,
          ),
        );
      }
      return toInfo(device);
    },
    list() {
      return devices.map(toInfo).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    },
    remove(id) {
      if (!devices.some((d) => d.id === id)) return false;
      commit(devices.filter((d) => d.id !== id));
      return true;
    },
  };
}
