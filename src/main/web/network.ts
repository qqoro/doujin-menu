import dgram from "dgram";
import type os from "os";
import type { MobileRoute } from "../../types/ipc.js";

const parseIPv4 = (hostname: string): number[] | null => {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : NaN,
  );
  return octets.every((n) => n >= 0 && n <= 255) ? octets : null;
};

export function isPrivateIPv4(hostname: string): boolean {
  const ip = parseIPv4(hostname);
  if (!ip) return false;
  const [a, b] = ip;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

// Hyper-V(WSL 포함), VirtualBox, VMware가 만드는 가상 어댑터는 폰이 닿을 수 없다
const VIRTUAL_ADAPTER = /vEthernet|WSL|VirtualBox|VMware/i;

export function pickLanAddresses(
  ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
): string[] {
  const result: string[] = [];
  for (const [name, infos] of Object.entries(ifaces)) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (isPrivateIPv4(info.address)) result.push(info.address);
    }
  }
  return result;
}

export function selectLanAddress(
  candidates: string[],
  saved: string | undefined,
  preferred: string | null = null,
): string | null {
  if (saved && candidates.includes(saved)) return saved;
  if (preferred && candidates.includes(preferred)) return preferred;
  return candidates[0] ?? null;
}

/**
 * 인터넷으로 나가는 어댑터의 주소. 어댑터 이름만으로는 가상 어댑터를 다 못 거른다
 * (한국어 Windows에서는 VirtualBox 어댑터도 "이더넷 3" 같은 이름을 쓴다).
 * UDP connect는 경로만 정하고 패킷을 보내지 않는다.
 */
export function findDefaultRouteAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const done = (address: string | null) => {
      socket.close();
      resolve(address);
    };
    socket.on("error", () => done(null));
    socket.connect(53, "8.8.8.8", () => {
      try {
        done(socket.address().address);
      } catch {
        done(null);
      }
    });
  });
}

export function classifyRoute(
  hostname: string,
  customHostname: string | null,
): MobileRoute {
  if (customHostname && hostname === customHostname) return "custom";
  if (hostname.endsWith(".ts.net")) return "tailscale";
  if (isPrivateIPv4(hostname)) return "lan";
  return "local";
}
