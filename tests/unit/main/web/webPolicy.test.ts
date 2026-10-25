import { describe, expect, it } from "vitest";
import {
  isBlockedWebConfigWrite,
  PC_ONLY_INVOKE_CHANNELS,
  sanitizeWebResponse,
} from "../../../../src/main/web/webPolicy.js";

describe("PC_ONLY_INVOKE_CHANNELS", () => {
  it("PC 화면을 띄우거나 창에 기대는 채널만 담는다", () => {
    expect([...PC_ONLY_INVOKE_CHANNELS].sort()).toEqual(
      [
        "add-library-folder",
        "select-external-image-viewer",
        "select-external-archive-viewer",
        "backup-database",
        "restore-database",
        "add-books-from-directory",
        "select-folder",
        "open-book-folder",
        "open-folder-in-explorer",
        "open-with-external-program",
        "open-book-with-external-viewer",
        "open-folder",
        "download-update",
        "install-update",
        "is-fullscreen-window",
        "is-new-window",
        "get-window-maximized-state",
        "get-mobile-web-status",
        "revoke-mobile-device",
        "get-mobile-web-running",
      ].sort(),
    );
  });
});

describe("isBlockedWebConfigWrite", () => {
  it("모바일 접속 설정 쓰기만 막는다", () => {
    expect(
      isBlockedWebConfigWrite("set-config", [
        { key: "mobileWebUrl", value: "x" },
      ]),
    ).toBe(true);
    expect(
      isBlockedWebConfigWrite("set-config", [
        { key: "mobileWebEnabled", value: false },
      ]),
    ).toBe(true);
    expect(isBlockedWebConfigWrite("set-config", [{ key: "theme" }])).toBe(
      false,
    );
    expect(isBlockedWebConfigWrite("get-config", [])).toBe(false);
    expect(isBlockedWebConfigWrite("set-config", [null])).toBe(false);
    expect(isBlockedWebConfigWrite("set-config", [])).toBe(false);
  });
});

describe("sanitizeWebResponse", () => {
  it("get-config 응답에서 잠금 비밀번호 해시를 뺀다", () => {
    const config = { theme: "auto", appLockPassword: "s:h" };
    expect(sanitizeWebResponse("get-config", [], config)).toEqual({
      theme: "auto",
    });
    expect(config.appLockPassword).toBe("s:h");
  });

  it("get-config-value로 비밀번호 키를 물으면 빈 문자열을 돌려준다", () => {
    expect(
      sanitizeWebResponse("get-config-value", ["appLockPassword"], "s:h"),
    ).toBe("");
  });

  it("다른 채널 응답은 그대로 둔다", () => {
    const value = { a: 1 };
    expect(sanitizeWebResponse("get-books", [], value)).toBe(value);
  });
});
