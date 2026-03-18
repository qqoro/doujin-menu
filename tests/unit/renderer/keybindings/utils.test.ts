import { describe, it, expect } from "vitest";
import {
  normalizeKey,
  getKeyLabel,
} from "../../../../src/renderer/lib/keybindings/utils";

function createKeyEvent(
  key: string,
  options: Partial<KeyboardEvent> = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...options,
  } as KeyboardEvent;
}

describe("normalizeKey", () => {
  it("단일 영문 키는 소문자로 정규화", () => {
    expect(normalizeKey(createKeyEvent("A"))).toBe("a");
    expect(normalizeKey(createKeyEvent("a"))).toBe("a");
  });

  it("Ctrl 수식키는 항상 prefix로 추가", () => {
    expect(normalizeKey(createKeyEvent("f", { ctrlKey: true }))).toBe("Ctrl+f");
    expect(normalizeKey(createKeyEvent("0", { ctrlKey: true }))).toBe("Ctrl+0");
  });

  it("Shift는 비인쇄 키에만 추가", () => {
    expect(normalizeKey(createKeyEvent("Delete", { shiftKey: true }))).toBe(
      "Shift+Delete",
    );
    expect(normalizeKey(createKeyEvent("{", { shiftKey: true }))).toBe("{");
    expect(normalizeKey(createKeyEvent(")", { shiftKey: true }))).toBe(")");
  });

  it("특수 키는 그대로 유지", () => {
    expect(normalizeKey(createKeyEvent("F11"))).toBe("F11");
    expect(normalizeKey(createKeyEvent("Escape"))).toBe("Escape");
    expect(normalizeKey(createKeyEvent("ArrowRight"))).toBe("ArrowRight");
    expect(normalizeKey(createKeyEvent(" "))).toBe(" ");
  });

  it("Alt 수식키 처리", () => {
    expect(normalizeKey(createKeyEvent("F4", { altKey: true }))).toBe("Alt+F4");
  });

  it("복합 수식키", () => {
    expect(
      normalizeKey(createKeyEvent("Delete", { ctrlKey: true, shiftKey: true })),
    ).toBe("Ctrl+Shift+Delete");
  });

  it("수식키 단독 입력은 그대로 반환", () => {
    expect(normalizeKey(createKeyEvent("Control", { ctrlKey: true }))).toBe(
      "Control",
    );
    expect(normalizeKey(createKeyEvent("Shift", { shiftKey: true }))).toBe(
      "Shift",
    );
    expect(normalizeKey(createKeyEvent("Alt", { altKey: true }))).toBe("Alt");
  });
});

describe("getKeyLabel", () => {
  it("특수 키를 읽기 쉬운 라벨로 변환", () => {
    expect(getKeyLabel("ArrowRight")).toBe("→");
    expect(getKeyLabel("ArrowLeft")).toBe("←");
    expect(getKeyLabel("ArrowUp")).toBe("↑");
    expect(getKeyLabel("ArrowDown")).toBe("↓");
    expect(getKeyLabel("Escape")).toBe("Esc");
    expect(getKeyLabel(" ")).toBe("Space");
  });

  it("수식키 포함 라벨 변환", () => {
    expect(getKeyLabel("Ctrl+f")).toBe("Ctrl+F");
    expect(getKeyLabel("Shift+Delete")).toBe("Shift+Del");
  });

  it("단일 영문자는 대문자로 표시", () => {
    expect(getKeyLabel("a")).toBe("A");
    expect(getKeyLabel("v")).toBe("V");
  });
});
