import { describe, expect, it, vi } from "vitest";
import {
  hasSession,
  requestPairing,
  takePairCode,
  withPairCode,
} from "@/lib/pairing";

describe("hasSession", () => {
  const fetchWith = (result: Response | Error) =>
    vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }) as unknown as typeof fetch;

  it("세션 확인이 204면 이미 연결된 기기", async () => {
    const fetchFn = fetchWith(new Response(null, { status: 204 }));
    await expect(hasSession(fetchFn)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledWith("/api/session");
  });

  it("401이거나 PC에 닿지 않으면 연결 안 된 기기", async () => {
    await expect(
      hasSession(fetchWith(new Response(null, { status: 401 }))),
    ).resolves.toBe(false);
    await expect(
      hasSession(fetchWith(new TypeError("Failed to fetch"))),
    ).resolves.toBe(false);
  });
});

describe("takePairCode", () => {
  it("pair 쿼리를 꺼내고 해시는 남긴 채 주소에서 지운다", () => {
    const replace = vi.fn();
    expect(
      takePairCode("http://192.168.0.5:47900/?pair=123456#/library", replace),
    ).toBe("123456");
    expect(replace).toHaveBeenCalledWith("http://192.168.0.5:47900/#/library");
  });

  it("빈 값도 지우고 null을 돌려준다", () => {
    const replace = vi.fn();
    expect(takePairCode("http://h/?pair=&x=1#/", replace)).toBeNull();
    expect(replace).toHaveBeenCalledWith("http://h/?x=1#/");
  });

  it("pair가 없으면 주소를 건드리지 않는다", () => {
    const replace = vi.fn();
    expect(takePairCode("http://h/#/library", replace)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("withPairCode", () => {
  it("주소에 연결 코드를 붙인다", () => {
    expect(withPairCode("http://192.168.0.5:47900/", "012345")).toBe(
      "http://192.168.0.5:47900/?pair=012345",
    );
    expect(withPairCode("https://h.ts.net/app?x=1#/a", "012345")).toBe(
      "https://h.ts.net/app?x=1&pair=012345#/a",
    );
  });
});

describe("requestPairing", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

  it("코드와 클라이언트 id를 보내고 성공을 알린다", async () => {
    const fetchFn = vi.fn(async () => json(200, { ok: true }));
    await expect(
      requestPairing(fetchFn as unknown as typeof fetch, "c1", "123456"),
    ).resolves.toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/pair");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"code":"123456"}');
    expect((init.headers as Record<string, string>)["x-client-id"]).toBe("c1");
  });

  it("실패하면 서버 문구를 돌려준다", async () => {
    const fetchFn = vi.fn(async () =>
      json(429, { error: "시도가 너무 많습니다. 1분 뒤에 다시 입력하세요." }),
    );
    await expect(
      requestPairing(fetchFn as unknown as typeof fetch, "c1", "123456"),
    ).resolves.toEqual({
      ok: false,
      message: "시도가 너무 많습니다. 1분 뒤에 다시 입력하세요.",
    });
  });

  it("PC에 닿지 않으면 연결할 수 없다고 알린다", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      requestPairing(fetchFn as unknown as typeof fetch, "c1", "123456"),
    ).resolves.toEqual({ ok: false, message: "PC에 연결할 수 없습니다." });
  });
});
