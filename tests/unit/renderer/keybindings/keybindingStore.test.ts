import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeybindingStore } from "../../../../src/renderer/store/keybindingStore";

describe("keybindingStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("resolvedBindings", () => {
    it("오버라이드 없으면 기본값 사용", () => {
      const store = useKeybindingStore();
      const nextPage = store.resolvedBindings.find(
        (b) => b.id === "viewer:next-page",
      );
      expect(nextPage).toBeDefined();
      expect(nextPage!.keys).toEqual([
        "ArrowRight",
        "ArrowDown",
        "PageDown",
        " ",
      ]);
      expect(nextPage!.isModified).toBe(false);
    });

    it("오버라이드 있으면 오버라이드 키 사용", () => {
      const store = useKeybindingStore();
      store.loadOverrides([{ actionId: "viewer:next-page", keys: ["d"] }]);
      const nextPage = store.resolvedBindings.find(
        (b) => b.id === "viewer:next-page",
      );
      expect(nextPage!.keys).toEqual(["d"]);
      expect(nextPage!.isModified).toBe(true);
    });
  });

  describe("findActionByKey", () => {
    it("컨텍스트 + 키로 액션 찾기", () => {
      const store = useKeybindingStore();
      const action = store.findActionByKey("viewer", "ArrowRight");
      expect(action).toBeDefined();
      expect(action!.id).toBe("viewer:next-page");
    });

    it("다른 컨텍스트의 키는 매칭 안 됨", () => {
      const store = useKeybindingStore();
      const action = store.findActionByKey("library", "ArrowRight");
      expect(action).toBeNull();
    });
  });

  describe("setKeys", () => {
    it("키 변경 시 오버라이드 추가", () => {
      const store = useKeybindingStore();
      store.setKeys("viewer:next-page", ["d", "ArrowRight"]);
      const action = store.findActionByKey("viewer", "d");
      expect(action!.id).toBe("viewer:next-page");
    });

    it("충돌 키는 기존 액션에서 자동 해제", () => {
      const store = useKeybindingStore();
      store.setKeys("viewer:prev-page", ["ArrowRight"]);
      const nextPage = store.resolvedBindings.find(
        (b) => b.id === "viewer:next-page",
      );
      expect(nextPage!.keys).not.toContain("ArrowRight");
    });
  });

  describe("resetAction", () => {
    it("개별 액션을 기본값으로 복원", () => {
      const store = useKeybindingStore();
      store.setKeys("viewer:next-page", ["d"]);
      store.resetAction("viewer:next-page");
      const action = store.resolvedBindings.find(
        (b) => b.id === "viewer:next-page",
      );
      expect(action!.keys).toEqual([
        "ArrowRight",
        "ArrowDown",
        "PageDown",
        " ",
      ]);
      expect(action!.isModified).toBe(false);
    });
  });

  describe("resetAll", () => {
    it("전체 초기화", () => {
      const store = useKeybindingStore();
      store.setKeys("viewer:next-page", ["d"]);
      store.setKeys("layout:minimize", ["q"]);
      store.resetAll();
      expect(store.resolvedBindings.every((b) => !b.isModified)).toBe(true);
    });
  });
});
