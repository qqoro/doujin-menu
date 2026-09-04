import { toCloneable } from "@/lib/ipcSafe";
import { describe, expect, it } from "vitest";
import { reactive, ref } from "vue";

describe("toCloneable", () => {
  it("ref 배열의 원소가 프록시로 남지 않는다", () => {
    const channels = ref([{ handle: "a", name: "A" }]);

    // 스프레드는 바깥 배열만 새로 만들고 원소는 프록시로 남는다
    expect(() => structuredClone([...channels.value])).toThrow();
    expect(() => structuredClone(toCloneable(channels.value))).not.toThrow();
  });

  it("중첩된 반응형 객체까지 벗긴다", () => {
    const state = reactive({
      list: [{ nested: { deep: [{ value: 1 }] } }],
    });

    const plain = toCloneable(state);
    expect(() => structuredClone(plain)).not.toThrow();
    expect(plain).toEqual({ list: [{ nested: { deep: [{ value: 1 }] } }] });
  });

  it("ref를 값으로 품고 있어도 풀어낸다", () => {
    const plain = toCloneable({ count: ref(3), items: ref(["a"]) });

    expect(plain).toEqual({ count: 3, items: ["a"] });
    expect(() => structuredClone(plain)).not.toThrow();
  });

  it("순환 참조에서 무한 재귀하지 않는다", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;

    const plain = toCloneable(reactive(node)) as Record<string, unknown>;
    expect(plain.self).toBe(plain);
  });

  it("복제 가능한 내장 타입은 그대로 둔다", () => {
    const date = new Date("2026-09-04T00:00:00Z");
    const bytes = new Uint8Array([1, 2, 3]);

    const plain = toCloneable({ date, bytes });
    expect(plain.date).toBe(date);
    expect(plain.bytes).toBe(bytes);
    expect(() => structuredClone(plain)).not.toThrow();
  });

  it("원시값은 그대로 통과시킨다", () => {
    expect(toCloneable(1)).toBe(1);
    expect(toCloneable("a")).toBe("a");
    expect(toCloneable(null)).toBe(null);
    expect(toCloneable(undefined)).toBe(undefined);
  });
});
