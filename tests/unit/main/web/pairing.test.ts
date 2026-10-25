import { describe, expect, it } from "vitest";
import {
  CODE_TTL_MS,
  createPairingCodes,
  FAILURE_WINDOW_MS,
  PAIRING_WINDOW_MS,
} from "../../../../src/main/web/pairing.js";

const setup = () => {
  let now = 1_000_000;
  let seq = 0;
  const codes = createPairingCodes({
    now: () => now,
    generate: () => String(++seq).padStart(6, "0"),
  });
  // PC의 모바일 페이지가 열려 있는 상태에서 시작한다
  codes.arm();
  return {
    codes,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("createPairingCodes", () => {
  it("만료 전에는 같은 코드, 5분이 지나면 새 코드", () => {
    const { codes, advance } = setup();
    const first = codes.current();
    expect(first.code).toMatch(/^\d{6}$/);
    expect(first.expiresAt).toBe(1_000_000 + CODE_TTL_MS);
    advance(CODE_TTL_MS - 1);
    expect(codes.current().code).toBe(first.code);
    advance(1);
    expect(codes.current().code).not.toBe(first.code);
  });

  it("한 번 쓴 코드는 다시 쓸 수 없고 즉시 바뀐다", () => {
    const { codes } = setup();
    const { code } = codes.current();
    expect(codes.attempt(code)).toBe("ok");
    expect(codes.current().code).not.toBe(code);
    expect(codes.attempt(code)).toBe("invalid");
  });

  it("만료된 코드는 거절한다", () => {
    const { codes, advance } = setup();
    const { code } = codes.current();
    advance(CODE_TTL_MS);
    codes.arm();
    expect(codes.attempt(code)).toBe("invalid");
  });

  it("형식이 틀린 입력은 invalid", () => {
    const { codes } = setup();
    expect(codes.attempt("12345")).toBe("invalid");
    expect(codes.attempt("abcdef")).toBe("invalid");
    expect(codes.attempt("")).toBe("invalid");
  });

  it("잘못된 시도 5회 뒤에는 맞는 코드도 거절하고, 1분이 지나면 풀린다", () => {
    const { codes, advance } = setup();
    for (let i = 0; i < 5; i++) {
      expect(codes.attempt("999999")).toBe("invalid");
    }
    const { code } = codes.current();
    expect(codes.attempt(code)).toBe("rate-limited");
    advance(FAILURE_WINDOW_MS);
    codes.arm();
    expect(codes.attempt(code)).toBe("ok");
  });

  it("형식이 틀린 입력도 실패로 센다", () => {
    const { codes } = setup();
    for (let i = 0; i < 5; i++) codes.attempt("x");
    expect(codes.attempt(codes.current().code)).toBe("rate-limited");
  });
});

describe("페어링 허용 창", () => {
  it("PC의 모바일 페이지가 한 번도 열리지 않았으면 맞는 코드도 closed", () => {
    const codes = createPairingCodes({
      now: () => 0,
      generate: () => "123456",
    });
    expect(codes.attempt(codes.current().code)).toBe("closed");
  });

  it("페이지가 상태를 확인한 뒤 30초 동안만 받는다", () => {
    let now = 0;
    const codes = createPairingCodes({
      now: () => now,
      generate: () => "123456",
    });
    codes.arm();
    now = PAIRING_WINDOW_MS - 1;
    expect(codes.attempt("000000")).toBe("invalid");
    now = PAIRING_WINDOW_MS;
    expect(codes.attempt("123456")).toBe("closed");
    codes.arm();
    expect(codes.attempt("123456")).toBe("ok");
  });

  it("창이 닫혀 있을 때의 시도는 실패로 세지 않는다 (주인의 페어링을 막지 않게)", () => {
    const codes = createPairingCodes({
      now: () => 0,
      generate: () => "123456",
    });
    for (let i = 0; i < 10; i++) codes.attempt("999999");
    codes.arm();
    expect(codes.attempt("123456")).toBe("ok");
  });
});
