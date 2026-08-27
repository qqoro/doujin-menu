import { beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.fn();
vi.mock("electron", () => ({
  shell: {
    openExternal: (url: string) => openExternal(url),
  },
}));

import {
  isAllowedExternalUrl,
  openExternalIfAllowed,
} from "../../../src/main/utils/externalLink.js";

describe("isAllowedExternalUrl", () => {
  it("허용 도메인의 https URL을 통과시킨다", () => {
    expect(isAllowedExternalUrl("https://github.com/qqoro/doujin-menu")).toBe(
      true,
    );
    expect(isAllowedExternalUrl("https://www.dlsite.com/home")).toBe(true);
    expect(isAllowedExternalUrl("https://forms.gle/abc")).toBe(true);
    expect(isAllowedExternalUrl("https://tweakcn.com/#examples")).toBe(true);
  });

  it("https가 아닌 스킴을 막는다", () => {
    expect(isAllowedExternalUrl("http://github.com")).toBe(false);
    expect(isAllowedExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(
      false,
    );
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("steam://run/1")).toBe(false);
  });

  it("도메인을 접두사가 아니라 완전 일치로 본다", () => {
    expect(isAllowedExternalUrl("https://github.com.evil.test/x")).toBe(false);
    expect(isAllowedExternalUrl("https://notgithub.com")).toBe(false);
    expect(
      isAllowedExternalUrl("https://evil.test/?q=https://github.com"),
    ).toBe(false);
  });

  it("서브도메인은 목록에 있는 것만 통과한다", () => {
    expect(isAllowedExternalUrl("https://www.dlsite.com")).toBe(true);
    expect(isAllowedExternalUrl("https://www.github.com")).toBe(false);
  });

  it("URL로 파싱되지 않으면 막는다", () => {
    expect(isAllowedExternalUrl("")).toBe(false);
    expect(isAllowedExternalUrl("그냥 문자열")).toBe(false);
  });
});

describe("openExternalIfAllowed", () => {
  beforeEach(() => {
    openExternal.mockClear();
  });

  it("허용된 URL만 실제로 연다", () => {
    expect(openExternalIfAllowed("https://github.com/x")).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://github.com/x");
  });

  it("차단된 URL은 열지 않는다", () => {
    expect(openExternalIfAllowed("file:///C:/evil.exe")).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });
});
