import { execFile } from "child_process";
import type { TailscaleInfo } from "../../types/ipc.js";

const CLI_CANDIDATES = [
  "tailscale",
  "C:\\Program Files\\Tailscale\\tailscale.exe",
];
const CLI_TIMEOUT_MS = 3000;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

export function parseTailscaleStatus(json: unknown): {
  running: boolean;
  dnsName: string | null;
} {
  const status = asRecord(json);
  const running = status?.BackendState === "Running";
  const dnsName = asRecord(status?.Self)?.DNSName;
  const name =
    typeof dnsName === "string" && dnsName ? dnsName.replace(/\.$/, "") : null;
  return { running, dnsName: name };
}

/**
 * 이 포트를 프록시하는 사이트가 있으면 tailnet 전용(serve)인지 인터넷 공개(funnel)인지.
 * Funnel은 `AllowFunnel`에 `Web`과 같은 사이트 키(`<DNSName>:443`)로 표시된다.
 */
export function getServeMode(
  serveJson: unknown,
  port: number,
): "serve" | "funnel" | null {
  const targets = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `127.0.0.1:${port}`,
    `${port}`,
  ]);
  const config = asRecord(serveJson);
  const web = asRecord(config?.Web) ?? {};
  const funnel = asRecord(config?.AllowFunnel) ?? {};
  for (const [siteKey, site] of Object.entries(web)) {
    const handlers = asRecord(asRecord(site)?.Handlers) ?? {};
    for (const handler of Object.values(handlers)) {
      const proxy = asRecord(handler)?.Proxy;
      if (typeof proxy === "string" && targets.has(proxy.replace(/\/$/, ""))) {
        return funnel[siteKey] === true ? "funnel" : "serve";
      }
    }
  }
  return null;
}

class NotInstalledError extends Error {}

const runOnce = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: CLI_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => {
        // 로그아웃 상태에서는 0이 아닌 코드로 끝나도 JSON은 출력한다
        if (error && !stdout) reject(error);
        else resolve(stdout);
      },
    );
  });

async function runCli(args: string[]): Promise<string> {
  for (const file of CLI_CANDIDATES) {
    try {
      return await runOnce(file, args);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new NotInstalledError();
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export async function getTailscaleInfo(port: number): Promise<TailscaleInfo> {
  const command = `tailscale funnel --bg ${port}`;
  try {
    const status = parseTailscaleStatus(
      parseJson(await runCli(["status", "--json"])),
    );
    if (!status.running || !status.dnsName) {
      return { state: "logged-out", url: null, command };
    }
    const url = `https://${status.dnsName}/`;
    const serve = parseJson(await runCli(["serve", "status", "--json"]));
    return { state: getServeMode(serve, port) ?? "not-served", url, command };
  } catch (error) {
    if (error instanceof NotInstalledError) {
      return { state: "not-installed", url: null, command };
    }
    return { state: "logged-out", url: null, command };
  }
}
