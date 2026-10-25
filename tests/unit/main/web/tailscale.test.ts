import { describe, expect, it } from "vitest";
import {
  getServeMode,
  parseTailscaleStatus,
} from "../../../../src/main/web/tailscale.js";

describe("parseTailscaleStatus", () => {
  it("실행 중이면 DNS 이름에서 끝의 점을 뗀다", () => {
    expect(
      parseTailscaleStatus({
        BackendState: "Running",
        Self: { DNSName: "home.tail1234.ts.net." },
      }),
    ).toEqual({ running: true, dnsName: "home.tail1234.ts.net" });
  });

  it("로그인 전 상태는 실행 중이 아니고 이름도 없다", () => {
    expect(
      parseTailscaleStatus({ BackendState: "NoState", Self: { DNSName: "" } }),
    ).toEqual({ running: false, dnsName: null });
  });

  it("모양이 다른 입력은 실행 중이 아닌 것으로 본다", () => {
    expect(parseTailscaleStatus("garbage")).toEqual({
      running: false,
      dnsName: null,
    });
  });
});

describe("getServeMode", () => {
  // 실제 `tailscale funnel --bg 47900` 직후 `tailscale serve status --json` 출력 모양
  const served = {
    TCP: { "443": { HTTPS: true } },
    Web: {
      "home.tail1.ts.net:443": {
        Handlers: { "/": { Proxy: "http://127.0.0.1:47900" } },
      },
    },
  };
  const funnel = {
    ...served,
    AllowFunnel: { "home.tail1.ts.net:443": true },
  };

  it("이 포트로 프록시하면 serve, 그 사이트에 AllowFunnel이 있으면 funnel", () => {
    expect(getServeMode(served, 47900)).toBe("serve");
    expect(getServeMode(funnel, 47900)).toBe("funnel");
  });

  it("다른 사이트의 Funnel 허용은 상관없다", () => {
    expect(
      getServeMode(
        { ...served, AllowFunnel: { "other.tail1.ts.net:443": true } },
        47900,
      ),
    ).toBe("serve");
  });

  it("다른 포트거나 설정이 없으면 null", () => {
    expect(getServeMode(funnel, 50000)).toBeNull();
    expect(getServeMode({}, 47900)).toBeNull();
    expect(getServeMode(null, 47900)).toBeNull();
  });

  it("프록시 대상 표기가 달라도 같은 포트로 본다", () => {
    const withProxy = (proxy: string) => ({
      Web: { "h.ts.net:443": { Handlers: { "/": { Proxy: proxy } } } },
    });
    for (const proxy of [
      "http://localhost:47900",
      "http://127.0.0.1:47900/",
      "127.0.0.1:47900",
      "47900",
    ]) {
      expect(getServeMode(withProxy(proxy), 47900)).toBe("serve");
    }
  });
});
