import { describe, expect, it } from "vitest";
import {
  formatPairCode,
  formatRelativeTime,
  formatRemaining,
  isHttpUrl,
} from "@/lib/mobilePage";

describe("isHttpUrl", () => {
  it("http·https 주소만 참", () => {
    expect(isHttpUrl("https://menu.example.com")).toBe(true);
    expect(isHttpUrl("http://192.168.0.5:47900/")).toBe(true);
  });

  it("스킴이 없거나 다른 스킴이면 거짓", () => {
    expect(isHttpUrl("myhost.duckdns.org:47900")).toBe(false);
    expect(isHttpUrl("menu.example.com")).toBe(false);
    expect(isHttpUrl("ftp://a.b")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("formatPairCode", () => {
  it("세 자리씩 띄운다", () => {
    expect(formatPairCode("482913")).toBe("482 913");
  });
});

describe("formatRemaining", () => {
  it("분:초로 보여 주고 음수는 0", () => {
    expect(formatRemaining(272_000)).toBe("4:32");
    expect(formatRemaining(5_400)).toBe("0:06");
    expect(formatRemaining(-1)).toBe("0:00");
  });
});

describe("formatRelativeTime", () => {
  const now = 10 * 24 * 60 * 60 * 1000;
  it("가까운 순서대로 방금 전·분·시간·일", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("방금 전");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5분 전");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3시간 전");
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe("3일 전");
  });
});
