import { createReadStream } from "fs";
import fs from "fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "http";
import path from "path";
import type { MobileRoute } from "../../types/ipc.js";
import { serveBookPage } from "../utils/bookPage.js";
import { imageMimeType } from "../utils/imageFiles.js";
import { addWebClient, createWebSender } from "./eventHub.js";
import { getInvokeHandler } from "./ipcRegistry.js";
import { resolveAllowedMediaFile } from "./mediaFiles.js";
import { classifyRoute, isPrivateIPv4 } from "./network.js";
import {
  isBlockedWebConfigWrite,
  MOBILE_SETTINGS_MESSAGE,
  PC_ONLY_INVOKE_CHANNELS,
  PC_ONLY_MESSAGE,
  sanitizeWebResponse,
} from "./webPolicy.js";

export type RendererSource =
  { kind: "static"; dir: string } | { kind: "proxy"; port: number };

export interface WebAuth {
  /** 유효하면 기기 id */
  verify(token: string): string | null;
  pair(
    code: string,
    info: { userAgent: string; route: MobileRoute },
  ):
    | { ok: true; token: string }
    | { ok: false; reason: "invalid" | "rate-limited" | "closed" };
}

export interface WebServerOptions {
  port: number;
  /** 기본은 루프백. 와이파이로 열 때만 "0.0.0.0"을 넘긴다 */
  host?: string;
  renderer: RendererSource;
  mediaRoots: string[];
  auth: WebAuth;
  /** 직접 입력한 접속 주소. Host 허용, 경로 분류, Secure 판단에 쓴다 */
  customOrigin?: () => { hostname: string; secure: boolean } | null;
}

export interface WebServerHandle {
  port: number;
  close(): Promise<void>;
  /** 해제된 기기의 열린 이벤트 연결을 끊는다 */
  disconnectDevice(id: string): void;
}

export const DEVICE_COOKIE = "dm_device";
const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
const PAIR_BODY_LIMIT = 1024;
const SSE_PING_MS = 25_000;

const STATIC_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

class BodyTooLargeError extends Error {}

const readBody = (req: IncomingMessage, limit = Infinity): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new BodyTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * DNS 리바인딩 방어. PC 브라우저에 열린 다른 사이트가 자기 도메인을 이 서버 주소로
 * 돌려 같은 출처처럼 읽는 것을 Host로 막는다. 공격자는 도메인 이름을 써야 하므로
 * 사설 IP 리터럴은 허용해도 된다.
 */
const isAllowedHost = (hostname: string, customHostname: string | null) =>
  LOCAL_HOSTNAMES.has(hostname) ||
  hostname.endsWith(".ts.net") ||
  isPrivateIPv4(hostname) ||
  hostname === customHostname;

const readCookie = (header: string | undefined, name: string) => {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
};

const buildDeviceCookie = (token: string, secure: boolean) =>
  `${DEVICE_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_S}` +
  (secure ? "; Secure" : "");

const isFile = (filePath: string) =>
  fs
    .stat(filePath)
    .then((stat) => stat.isFile())
    .catch(() => false);

export function startWebServer(
  options: WebServerOptions,
): Promise<WebServerHandle> {
  // 열린 SSE 응답 → 기기 id
  const sseResponses = new Map<ServerResponse, string>();

  const handleInvoke = async (
    req: IncomingMessage,
    res: ServerResponse,
    channel: string,
  ) => {
    // 비표준 헤더를 요구하면 다른 출처의 요청은 preflight에 걸리고, 이 서버는
    // CORS 허용을 내주지 않으므로 브라우저가 보내지 못한다
    const clientId = req.headers["x-client-id"];
    if (typeof clientId !== "string" || !clientId) {
      sendJson(res, 403, { error: "허용되지 않은 요청입니다." });
      return;
    }
    if (PC_ONLY_INVOKE_CHANNELS.has(channel)) {
      sendJson(res, 403, { error: PC_ONLY_MESSAGE });
      return;
    }
    const handler = getInvokeHandler(channel);
    if (!handler) {
      sendJson(res, 404, { error: `알 수 없는 채널: ${channel}` });
      return;
    }

    let args: unknown[];
    try {
      const raw = await readBody(req);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error("인자는 배열이어야 합니다.");
      args = parsed;
    } catch (error) {
      sendJson(res, 400, { error: (error as Error).message });
      return;
    }
    if (isBlockedWebConfigWrite(channel, args)) {
      sendJson(res, 403, { error: MOBILE_SETTINGS_MESSAGE });
      return;
    }

    try {
      const result = await handler(
        { sender: createWebSender(clientId) },
        ...args,
      );
      sendJson(res, 200, {
        result: sanitizeWebResponse(channel, args, result),
      });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handlePair = async (
    req: IncomingMessage,
    res: ServerResponse,
    route: MobileRoute,
    secure: boolean,
  ) => {
    // invoke와 같은 이유로 비표준 헤더를 요구해 다른 출처의 요청을 막는다
    const clientId = req.headers["x-client-id"];
    if (typeof clientId !== "string" || !clientId) {
      sendJson(res, 403, { error: "허용되지 않은 요청입니다." });
      return;
    }
    let code: string;
    try {
      const parsed = JSON.parse(await readBody(req, PAIR_BODY_LIMIT)) as {
        code?: unknown;
      } | null;
      if (typeof parsed?.code !== "string") throw new Error();
      code = parsed.code;
    } catch {
      sendJson(res, 400, { error: "잘못된 요청입니다." });
      return;
    }

    const result = options.auth.pair(code, {
      userAgent: req.headers["user-agent"] ?? "",
      route,
    });
    if (result.ok) {
      res.setHeader("Set-Cookie", buildDeviceCookie(result.token, secure));
      sendJson(res, 200, { ok: true });
    } else if (result.reason === "rate-limited") {
      sendJson(res, 429, {
        error: "시도가 너무 많습니다. 1분 뒤에 다시 입력하세요.",
      });
    } else if (result.reason === "closed") {
      sendJson(res, 403, {
        error: "PC에서 동인메뉴판의 모바일 페이지를 연 상태에서 입력하세요.",
      });
    } else {
      // 5분마다 바뀌므로 오래된 QR을 찍은 경우가 많다
      sendJson(res, 400, {
        error:
          "코드가 만료되었거나 맞지 않습니다. PC 화면의 새 코드를 확인하세요.",
      });
    }
  };

  const handleEvents = (
    res: ServerResponse,
    clientId: string,
    deviceId: string,
  ) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    sseResponses.set(res, deviceId);
    // close()가 end()한 뒤 'close' 이벤트 전에 쓰면 리스너 없는 'error'가 나서
    // 메인 프로세스가 죽는다
    const write = (chunk: string) => {
      if (!res.writableEnded && !res.destroyed) res.write(chunk);
    };
    const remove = addWebClient({ id: clientId, write });
    const ping = setInterval(() => write(": ping\n\n"), SSE_PING_MS);
    res.on("close", () => {
      clearInterval(ping);
      remove();
      sseResponses.delete(res);
    });
  };

  const handleBookPage = async (
    res: ServerResponse,
    bookId: string,
    index: string,
  ) => {
    const page = await serveBookPage(parseInt(bookId), parseInt(index));
    const headers: Record<string, string> = {};
    const contentType = page.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;
    res.writeHead(page.status, headers);
    res.end(Buffer.from(await page.arrayBuffer()));
  };

  const handleMediaFile = async (res: ServerResponse, requested: string) => {
    const filePath = resolveAllowedMediaFile(requested, options.mediaRoots);
    if (!filePath || !(await isFile(filePath))) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": imageMimeType(filePath),
      "Cache-Control": "private, max-age=86400",
    });
    createReadStream(filePath).pipe(res);
  };

  const handleStatic = async (
    res: ServerResponse,
    dir: string,
    pathname: string,
  ) => {
    const root = path.resolve(dir);
    const relative = pathname === "/" ? "index.html" : `.${pathname}`;
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root + path.sep) || !(await isFile(filePath))) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        STATIC_MIME[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
  };

  const handleProxy = (
    req: IncomingMessage,
    res: ServerResponse,
    port: number,
  ) => {
    const upstream = http.request(
      {
        // Vite는 ::1에만 열리기도 하므로 127.0.0.1로 고정하지 않고 localhost를 해석시킨다
        host: "localhost",
        port,
        method: req.method,
        path: req.url,
        // Vite 개발 서버는 localhost가 아닌 Host 헤더를 거부한다
        headers: { ...req.headers, host: `localhost:${port}` },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const hostname = (req.headers.host ?? "")
        .replace(/:\d+$/, "")
        .toLowerCase();
      const custom = options.customOrigin?.() ?? null;
      if (!hostname || !isAllowedHost(hostname, custom?.hostname ?? null)) {
        res.writeHead(403).end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const { pathname } = url;

      if (pathname === "/api/pair" && req.method === "POST") {
        const route = classifyRoute(hostname, custom?.hostname ?? null);
        // serve/Funnel은 443(HTTPS)이라 Host에 포트가 없다. 포트가 붙었으면 tailnet에서 HTTP로
        // 바로 들어온 것이고, 거기에 Secure를 붙이면 브라우저가 쿠키를 버려 코드 입력이 반복된다
        const viaTailscaleHttps =
          route === "tailscale" && !/:\d+$/.test(req.headers.host ?? "");
        const secure =
          viaTailscaleHttps || (route === "custom" && !!custom?.secure);
        return handlePair(req, res, route, secure);
      }

      // 앱 셸(정적 파일)에는 데이터가 없고 페어링 화면이 그 위에 그려져야 하므로 열어 둔다.
      // tailscale serve/Funnel은 127.0.0.1로 넘겨 오므로 로컬 요청이라고 면제하면 안 된다.
      let deviceId: string | null = null;
      if (pathname.startsWith("/api/") || pathname.startsWith("/media/")) {
        deviceId = options.auth.verify(
          readCookie(req.headers.cookie, DEVICE_COOKIE),
        );
        if (!deviceId) {
          sendJson(res, 401, { error: "연결이 필요합니다." });
          return;
        }
      }

      if (pathname === "/api/session") {
        res.writeHead(204).end();
        return;
      }
      const invokeMatch = /^\/api\/invoke\/([^/]+)$/.exec(pathname);
      if (invokeMatch && req.method === "POST") {
        return handleInvoke(req, res, decodeURIComponent(invokeMatch[1]));
      }
      if (pathname === "/api/events" && deviceId) {
        return handleEvents(
          res,
          url.searchParams.get("clientId") ?? "",
          deviceId,
        );
      }
      const pageMatch = /^\/media\/page\/(\d+)\/(\d+)$/.exec(pathname);
      if (pageMatch) {
        return handleBookPage(res, pageMatch[1], pageMatch[2]);
      }
      if (pathname === "/media/file") {
        return handleMediaFile(res, url.searchParams.get("path") ?? "");
      }

      const { renderer } = options;
      if (renderer.kind === "proxy") {
        return handleProxy(req, res, renderer.port);
      }
      return handleStatic(res, renderer.dir, decodeURIComponent(pathname));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // listen(port, host)는 port가 객체면 그 안의 host를 쓰고 넘긴 host를 무시한다
    server.listen(
      { port: options.port, host: options.host ?? "127.0.0.1" },
      () => {
        server.off("error", reject);
        const address = server.address();
        const port =
          typeof address === "object" && address ? address.port : options.port;

        resolve({
          port,
          close: () =>
            new Promise<void>((done) => {
              for (const res of sseResponses.keys()) res.end();
              sseResponses.clear();
              server.close(() => done());
              server.closeAllConnections();
            }),
          disconnectDevice: (id) => {
            for (const [res, deviceId] of sseResponses) {
              if (deviceId === id) res.end();
            }
          },
        });
      },
    );
  });
}
