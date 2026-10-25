import { describe, expect, it } from "vitest";
import {
  LAST_INTERVAL_KEY,
  readLastInterval,
  writeLastInterval,
} from "@/lib/autoPlayPrefs";

const storageWith = (value: string | null) => ({
  getItem: (key: string) => (key === LAST_INTERVAL_KEY ? value : null),
});

describe("readLastInterval", () => {
  it("1~9 사이 정수를 읽는다", () => {
    expect(readLastInterval(storageWith("3"))).toBe(3);
  });

  it("범위 밖이나 숫자가 아니거나 없으면 null", () => {
    expect(readLastInterval(storageWith("0"))).toBeNull();
    expect(readLastInterval(storageWith("12"))).toBeNull();
    expect(readLastInterval(storageWith("abc"))).toBeNull();
    expect(readLastInterval(storageWith(null))).toBeNull();
  });

  it("저장소 접근이 실패하거나 저장소가 없으면 null", () => {
    expect(
      readLastInterval({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
    expect(readLastInterval(null)).toBeNull();
  });
});

describe("writeLastInterval", () => {
  it("키에 문자열로 저장한다", () => {
    const saved: Record<string, string> = {};
    writeLastInterval({ setItem: (k: string, v: string) => (saved[k] = v) }, 5);
    expect(saved[LAST_INTERVAL_KEY]).toBe("5");
  });

  it("저장이 실패해도 던지지 않는다", () => {
    expect(() =>
      writeLastInterval(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        5,
      ),
    ).not.toThrow();
  });
});
