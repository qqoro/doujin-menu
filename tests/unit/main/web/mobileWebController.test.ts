import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock("../../../../src/main/db/index.ts", () => ({
  default: {},
  closeDbConnection: vi.fn(),
}));

vi.mock("../../../../src/main/handlers/configHandler.js", () => ({
  store: { get: vi.fn(), onDidChange: vi.fn() },
}));

import {
  describeStartError,
  normalizePort,
  parseCustomOrigin,
} from "../../../../src/main/web/mobileWebController.js";

describe("parseCustomOrigin", () => {
  it("직접 입력한 주소에서 호스트와 https 여부를 꺼낸다", () => {
    expect(parseCustomOrigin("https://menu.example.com/")).toEqual({
      hostname: "menu.example.com",
      secure: true,
    });
    expect(parseCustomOrigin(" http://A.b:8080 ")).toEqual({
      hostname: "a.b",
      secure: false,
    });
  });

  it("비었거나 주소가 아니면 null", () => {
    expect(parseCustomOrigin("")).toBeNull();
    expect(parseCustomOrigin(undefined)).toBeNull();
    expect(parseCustomOrigin("not a url")).toBeNull();
  });
});

describe("describeStartError", () => {
  it("포트 충돌은 한국어로 알려 준다", () => {
    expect(describeStartError({ code: "EADDRINUSE" }, 47900)).toBe(
      "포트 47900을(를) 이미 사용 중입니다.",
    );
  });

  it("그 밖의 오류는 메시지를 붙인다", () => {
    expect(describeStartError(new Error("boom"), 47900)).toBe(
      "모바일 웹 서버를 시작하지 못했습니다: boom",
    );
  });
});

describe("normalizePort", () => {
  it("1024~65535 정수만 쓰고 그 밖은 기본값", () => {
    expect(normalizePort(50000)).toBe(50000);
    expect(normalizePort("50000")).toBe(50000);
    expect(normalizePort(80)).toBe(47900);
    expect(normalizePort({ port: 1, host: "0.0.0.0" })).toBe(47900);
    expect(normalizePort(undefined)).toBe(47900);
  });
});
