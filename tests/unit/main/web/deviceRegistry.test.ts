import { describe, expect, it, vi } from "vitest";
import {
  createDeviceRegistry,
  describeUserAgent,
  hashToken,
  LAST_SEEN_WRITE_MS,
  type StoredMobileDevice,
} from "../../../../src/main/web/deviceRegistry.js";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

const setup = () => {
  let stored: StoredMobileDevice[] = [];
  const backend = {
    load: () => stored,
    save: vi.fn((devices: StoredMobileDevice[]) => {
      stored = devices;
    }),
  };
  let now = 1_000;
  let seq = 0;
  const registry = createDeviceRegistry(backend, {
    now: () => now,
    randomToken: () => `token-${++seq}`,
  });
  return {
    registry,
    backend,
    stored: () => stored,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("createDeviceRegistry", () => {
  it("토큰 원문 없이 해시만 저장한다", () => {
    const { registry, stored } = setup();
    const { device, token } = registry.add({
      userAgent: ANDROID_CHROME,
      route: "lan",
    });
    expect(device).toMatchObject({
      name: "Android · Chrome",
      route: "lan",
      createdAt: 1_000,
      lastSeenAt: 1_000,
    });
    expect(stored()).toHaveLength(1);
    expect(stored()[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored())).not.toContain(token);
  });

  it("맞는 토큰만 기기를 돌려준다", () => {
    const { registry } = setup();
    const { device, token } = registry.add({ userAgent: "", route: "lan" });
    expect(registry.verify(token)?.id).toBe(device.id);
    expect(registry.verify("wrong")).toBeNull();
    expect(registry.verify("")).toBeNull();
  });

  it("해제하면 토큰이 즉시 무효가 된다", () => {
    const { registry } = setup();
    const { device, token } = registry.add({ userAgent: "", route: "lan" });
    expect(registry.remove(device.id)).toBe(true);
    expect(registry.verify(token)).toBeNull();
    expect(registry.remove("없는 id")).toBe(false);
  });

  it("목록에는 토큰 해시가 없고 최근 접속 순이다", () => {
    const { registry, advance } = setup();
    const a = registry.add({ userAgent: "", route: "lan" });
    advance(LAST_SEEN_WRITE_MS + 1);
    const b = registry.add({ userAgent: "", route: "tailscale" });
    expect(registry.list().map((d) => d.id)).toEqual([
      b.device.id,
      a.device.id,
    ]);
    expect(registry.list()[0]).not.toHaveProperty("tokenHash");
  });

  it("마지막 접속 시각은 묶어서 저장한다", () => {
    const { registry, backend, advance } = setup();
    const { token } = registry.add({ userAgent: "", route: "lan" });
    backend.save.mockClear();
    advance(30_000);
    registry.verify(token);
    advance(30_000);
    registry.verify(token);
    expect(backend.save).toHaveBeenCalledTimes(0);
    advance(1);
    registry.verify(token);
    expect(backend.save).toHaveBeenCalledTimes(1);
    expect(registry.list()[0].lastSeenAt).toBe(1_000 + 60_001);
  });
});

describe("describeUserAgent", () => {
  it("기기와 브라우저를 짧게 보여 준다", () => {
    expect(describeUserAgent(ANDROID_CHROME)).toBe("Android · Chrome");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone · Safari");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone · Chrome");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36",
      ),
    ).toBe("Android · 삼성 인터넷");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
      ),
    ).toBe("Windows · Edge");
  });

  it("모르는 값은 알 수 없는 기기", () => {
    expect(describeUserAgent("")).toBe("알 수 없는 기기");
    expect(describeUserAgent("curl/8.0")).toBe("알 수 없는 기기");
  });
});
