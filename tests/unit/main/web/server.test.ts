import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

vi.mock("../../../../src/main/utils/bookPage.js", () => ({
  serveBookPage: vi.fn(
    async () =>
      new Response(new Uint8Array([9]), {
        headers: { "Content-Type": "image/png" },
      }),
  ),
}));

import {
  captureIpcHandlers,
  resetIpcRegistryForTest,
} from "../../../../src/main/web/ipcRegistry.js";
import { publishWeb } from "../../../../src/main/web/eventHub.js";
import {
  startWebServer,
  type WebAuth,
  type WebServerHandle,
  type WebServerOptions,
} from "../../../../src/main/web/server.js";

const PC_ONLY = "PC에서만 사용할 수 있는 기능입니다.";
const COOKIE = "dm_device=good";

type PairFn = WebAuth["pair"];

describe("startWebServer", () => {
  let root: string;
  let staticDir: string;
  let thumbs: string;
  let outside: string;
  let server: WebServerHandle;
  let base: string;
  const pcOnlyHandler = vi.fn();
  const setConfigHandler = vi.fn(() => ({ success: true }));
  const pair = vi.fn<PairFn>((code) =>
    code === "123456"
      ? { ok: true, token: "good" }
      : { ok: false, reason: "invalid" },
  );
  const auth: WebAuth = {
    verify: (token) => (token === "good" ? "dev1" : null),
    pair: (...args) => pair(...args),
  };

  // 테스트에서는 방화벽 창이 뜨지 않도록 루프백에만 연다
  const options = (
    extra: Partial<WebServerOptions> = {},
  ): WebServerOptions => ({
    port: 0,
    host: "127.0.0.1",
    renderer: { kind: "static", dir: staticDir },
    mediaRoots: [],
    auth,
    ...extra,
  });

  const request = (opts: {
    method?: string;
    path: string;
    host?: string;
    headers?: Record<string, string>;
    body?: string;
  }) =>
    new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: server.port,
          method: opts.method ?? "GET",
          path: opts.path,
          headers: {
            host: opts.host ?? `127.0.0.1:${server.port}`,
            ...opts.headers,
          },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (body += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(opts.body);
    });

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "web-server-"));
    staticDir = path.join(root, "renderer");
    thumbs = path.join(root, "thumbs");
    await fs.mkdir(staticDir);
    await fs.mkdir(thumbs);
    await fs.writeFile(path.join(staticDir, "index.html"), "<html>ok</html>");
    await fs.writeFile(path.join(thumbs, "a.webp"), "img");
    outside = path.join(root, "secret.txt");
    await fs.writeFile(outside, "secret");

    resetIpcRegistryForTest();
    const fakeIpc = { handle: (_c: string, _l: unknown) => {} };
    captureIpcHandlers(fakeIpc);
    fakeIpc.handle("echo", (_e: unknown, a: unknown, b: unknown) => [a, b]);
    fakeIpc.handle("boom", () => {
      throw new Error("실패");
    });
    fakeIpc.handle("get-config", () => ({
      theme: "auto",
      appLockPassword: "s:h",
    }));
    fakeIpc.handle("set-config", setConfigHandler);
    fakeIpc.handle("add-library-folder", pcOnlyHandler);
    fakeIpc.handle("notify", (event: unknown) => {
      (event as { sender: { send(c: string): void } }).sender.send(
        "books-updated",
      );
      return true;
    });

    server = await startWebServer(
      options({
        mediaRoots: [thumbs],
        customOrigin: () => ({ hostname: "menu.example.com", secure: true }),
      }),
    );
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server?.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  const invoke = (channel: string, args: unknown[], clientId = "c0") =>
    fetch(`${base}/api/invoke/${channel}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-id": clientId,
        cookie: COOKIE,
      },
      body: JSON.stringify(args),
    });

  const postPair = (host: string, body: unknown, clientId = "c0") =>
    request({
      method: "POST",
      path: "/api/pair",
      host,
      headers: {
        "content-type": "application/json",
        ...(clientId ? { "x-client-id": clientId } : {}),
      },
      body: JSON.stringify(body),
    });

  it("핸들러 결과를 result로 감싸 돌려준다", async () => {
    const res = await invoke("echo", [1, "x"]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: [1, "x"] });
  });

  it("PC 전용 채널은 403으로 거부하고 핸들러를 부르지 않는다", async () => {
    const res = await invoke("add-library-folder", []);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PC_ONLY });
    expect(pcOnlyHandler).not.toHaveBeenCalled();
  });

  it("x-client-id 헤더가 없는 호출은 거부한다 (다른 사이트의 단순 요청 차단)", async () => {
    const res = await fetch(`${base}/api/invoke/echo`, {
      method: "POST",
      headers: { "content-type": "text/plain", cookie: COOKIE },
      body: "[1]",
    });
    expect(res.status).toBe(403);
  });

  it("허용되지 않은 Host로 온 요청은 거부한다 (DNS 리바인딩 차단)", async () => {
    const status = async (host: string) =>
      (await request({ path: "/", host })).status;
    expect(await status(`evil.test:${server.port}`)).toBe(403);
    expect(await status(`localhost:${server.port}`)).toBe(200);
    expect(await status("home.tail1234.ts.net")).toBe(200);
    expect(await status("menu.example.com")).toBe(200);
    expect(await status(`192.168.0.10:${server.port}`)).toBe(200);
    expect(await status(`8.8.8.8:${server.port}`)).toBe(403);
  });

  it("포트에 숫자가 아닌 값이 오면 다른 주소로 열지 않고 거부한다", async () => {
    await expect(
      startWebServer(
        options({ port: { port: 0, host: "0.0.0.0" } as unknown as number }),
      ),
    ).rejects.toThrow();
  });

  it("등록되지 않은 채널은 404", async () => {
    const res = await invoke("nope", []);
    expect(res.status).toBe(404);
  });

  it("핸들러가 던지면 500과 메시지를 돌려준다", async () => {
    const res = await invoke("boom", []);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "실패" });
  });

  it("get-config 응답에서 잠금 비밀번호 해시를 뺀다", async () => {
    const res = await invoke("get-config", []);
    const body = (await res.json()) as { result: Record<string, unknown> };
    expect(body.result).toEqual({ theme: "auto" });
  });

  it("원격에서 모바일 접속 설정은 바꿀 수 없다", async () => {
    const blocked = await invoke("set-config", [
      { key: "mobileWebEnabled", value: false },
    ]);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({
      error: "모바일 접속 설정은 PC에서만 바꿀 수 있습니다.",
    });
    expect(setConfigHandler).not.toHaveBeenCalled();

    const allowed = await invoke("set-config", [
      { key: "theme", value: "dark" },
    ]);
    expect(allowed.status).toBe(200);
    expect(setConfigHandler).toHaveBeenCalledTimes(1);
  });

  it("event.sender.send는 요청한 클라이언트의 SSE로 간다", async () => {
    let markConnected: () => void = () => {};
    const connected = new Promise<void>((r) => (markConnected = r));
    const received = new Promise<string>((resolve, reject) => {
      const req = http.get(
        `${base}/api/events?clientId=c1`,
        { headers: { cookie: COOKIE } },
        (res) => {
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            if (chunk.startsWith(": connected")) markConnected();
            if (chunk.startsWith("data:")) {
              resolve(chunk);
              req.destroy();
            }
          });
        },
      );
      req.on("error", reject);
    });
    // 서버가 클라이언트를 등록한 뒤에 보내야 한다
    await connected;
    await invoke("notify", [], "c1");
    expect(await received).toBe('data: {"channel":"books-updated"}\n\n');
  });

  it("뷰어 페이지는 serveBookPage 응답을 그대로 전달한다", async () => {
    const res = await fetch(`${base}/media/page/3/1`, {
      headers: { cookie: COOKIE },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([9]),
    );
  });

  it("허용 폴더의 파일은 내보내고 밖의 파일은 404", async () => {
    const ok = await fetch(
      `${base}/media/file?path=${encodeURIComponent(path.join(thumbs, "a.webp"))}&v=3`,
      { headers: { cookie: COOKIE } },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");

    const denied = await fetch(
      `${base}/media/file?path=${encodeURIComponent(outside)}`,
      { headers: { cookie: COOKIE } },
    );
    expect(denied.status).toBe(404);
  });

  it("정적 파일을 내보내고 폴더 밖 경로는 404", async () => {
    const res = await fetch(`${base}/`);
    expect(await res.text()).toBe("<html>ok</html>");

    expect((await request({ path: "/../secret.txt" })).status).toBe(404);
  });

  describe("인증", () => {
    it("앱 셸은 쿠키 없이 열린다", async () => {
      const res = await request({ path: "/" });
      expect(res.status).toBe(200);
    });

    it("쿠키 없는 API·미디어 요청은 401", async () => {
      const api = await request({
        method: "POST",
        path: "/api/invoke/echo",
        headers: { "content-type": "application/json", "x-client-id": "c0" },
        body: "[]",
      });
      expect(api.status).toBe(401);
      expect(JSON.parse(api.body)).toEqual({ error: "연결이 필요합니다." });

      const media = await request({
        path: `/media/file?path=${encodeURIComponent(path.join(thumbs, "a.webp"))}`,
      });
      expect(media.status).toBe(401);
      expect((await request({ path: "/media/page/3/1" })).status).toBe(401);
      expect((await request({ path: "/api/events?clientId=x" })).status).toBe(
        401,
      );
    });

    it("로컬 주소로 들어온 요청도 면제하지 않는다", async () => {
      const res = await request({
        path: "/api/session",
        host: `127.0.0.1:${server.port}`,
      });
      expect(res.status).toBe(401);
    });

    it("틀린 쿠키는 401", async () => {
      const res = await request({
        path: "/api/session",
        headers: { cookie: "other=1; dm_device=bad" },
      });
      expect(res.status).toBe(401);
    });

    it("세션 확인은 쿠키가 맞으면 204", async () => {
      const res = await request({
        path: "/api/session",
        headers: { cookie: `other=1; ${COOKIE}` },
      });
      expect(res.status).toBe(204);
    });
  });

  describe("페어링", () => {
    it("x-client-id가 없으면 403", async () => {
      const res = await postPair("192.168.0.10", { code: "123456" }, "");
      expect(res.status).toBe(403);
    });

    it("와이파이 주소에서는 Secure 없는 쿠키를 준다", async () => {
      pair.mockClear();
      const res = await postPair(`192.168.0.10:${server.port}`, {
        code: "123456",
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });
      const cookie = String(res.headers["set-cookie"]);
      expect(cookie).toContain("dm_device=good");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=31536000");
      expect(cookie).not.toContain("Secure");
      expect(pair).toHaveBeenCalledWith("123456", {
        userAgent: "",
        route: "lan",
      });
    });

    it("Tailscale 주소에서는 Secure 쿠키를 준다", async () => {
      pair.mockClear();
      const res = await postPair("home.tail1.ts.net", { code: "123456" });
      expect(String(res.headers["set-cookie"])).toContain("Secure");
      expect(pair.mock.calls[0][1].route).toBe("tailscale");
    });

    it("ts.net이라도 포트를 붙여 직접 들어왔으면(HTTP) Secure를 붙이지 않는다", async () => {
      const res = await postPair(`home.tail1.ts.net:${server.port}`, {
        code: "123456",
      });
      expect(res.status).toBe(200);
      expect(String(res.headers["set-cookie"])).not.toContain("Secure");
    });

    it("https로 입력한 직접 주소에서는 Secure 쿠키를 준다", async () => {
      pair.mockClear();
      const res = await postPair("menu.example.com", { code: "123456" });
      expect(String(res.headers["set-cookie"])).toContain("Secure");
      expect(pair.mock.calls[0][1].route).toBe("custom");
    });

    it("틀리거나 만료된 코드는 400, 새 코드를 보라고 안내", async () => {
      const res = await postPair("192.168.0.10", { code: "000000" });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({
        error:
          "코드가 만료되었거나 맞지 않습니다. PC 화면의 새 코드를 확인하세요.",
      });
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("시도 제한에 걸리면 429", async () => {
      pair.mockReturnValueOnce({ ok: false, reason: "rate-limited" });
      const res = await postPair("192.168.0.10", { code: "123456" });
      expect(res.status).toBe(429);
      expect(JSON.parse(res.body)).toEqual({
        error: "시도가 너무 많습니다. 1분 뒤에 다시 입력하세요.",
      });
    });

    it("PC의 모바일 페이지가 닫혀 있으면 403과 안내", async () => {
      pair.mockReturnValueOnce({ ok: false, reason: "closed" });
      const res = await postPair("192.168.0.10", { code: "123456" });
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body)).toEqual({
        error: "PC에서 동인메뉴판의 모바일 페이지를 연 상태에서 입력하세요.",
      });
    });

    it("모양이 틀린 본문은 400", async () => {
      const res = await request({
        method: "POST",
        path: "/api/pair",
        headers: { "content-type": "application/json", "x-client-id": "c0" },
        body: "not json",
      });
      expect(res.status).toBe(400);
      const wrongShape = await postPair("192.168.0.10", { code: 123456 });
      expect(wrongShape.status).toBe(400);
    });
  });

  it("기기를 끊으면 그 기기의 SSE가 끝난다", async () => {
    await new Promise<void>((resolve, reject) => {
      http
        .get(
          `${base}/api/events?clientId=c9`,
          { headers: { cookie: COOKIE } },
          (res) => {
            res.once("data", () => server.disconnectDevice("dev1"));
            res.on("end", () => resolve());
            res.resume();
          },
        )
        .on("error", reject);
    });
  });

  it("닫은 뒤에는 같은 포트로 다시 열 수 있다", async () => {
    const first = await startWebServer(options());
    const port = first.port;
    await first.close();
    const second = await startWebServer(options({ port }));
    await second.close();
  });

  it("이미 쓰는 포트면 EADDRINUSE로 거부한다", async () => {
    await expect(
      startWebServer(options({ port: server.port })),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });

  it("서버를 닫는 중에 이벤트가 나가도 오류를 내지 않는다", async () => {
    const other = await startWebServer(options());
    const errors: unknown[] = [];
    const onError = (e: unknown) => errors.push(e);
    process.on("uncaughtException", onError);
    try {
      await new Promise<void>((resolve, reject) => {
        http
          .get(
            `http://127.0.0.1:${other.port}/api/events?clientId=closing`,
            { headers: { cookie: COOKIE } },
            (res) => {
              res.on("data", () => resolve());
              res.on("error", () => {});
            },
          )
          .on("error", () => {})
          .on("close", () => reject(new Error("closed early")));
      });
      const closing = other.close();
      publishWeb("books-updated");
      await closing;
      await new Promise((r) => setTimeout(r, 50));
      expect(errors).toEqual([]);
    } finally {
      process.off("uncaughtException", onError);
    }
  });

  it("IPv6 localhost에만 열린 개발 서버(Vite)로도 프록시한다", async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`vite:${req.url}:${req.headers.host}`);
    });
    await new Promise<void>((r) => upstream.listen(0, "::1", r));
    const upstreamPort = (upstream.address() as { port: number }).port;

    const proxy = await startWebServer(
      options({ renderer: { kind: "proxy", port: upstreamPort } }),
    );
    try {
      const res = await fetch(`http://127.0.0.1:${proxy.port}/src/main.ts`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(
        `vite:/src/main.ts:localhost:${upstreamPort}`,
      );
    } finally {
      await proxy.close();
      await new Promise((r) => upstream.close(r));
    }
  });
});
