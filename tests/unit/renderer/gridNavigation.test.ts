import { describe, expect, it } from "vitest";
import { nextFocusIndex } from "../../../src/renderer/lib/gridNavigation";

describe("nextFocusIndex", () => {
  describe("좌우 이동", () => {
    it("한 칸씩 움직인다", () => {
      expect(nextFocusIndex(3, "right", 4, 20)).toBe(4);
      expect(nextFocusIndex(3, "left", 4, 20)).toBe(2);
    });

    it("행 경계를 넘어 이어진다", () => {
      // 목록을 한 줄로 이어붙인 순서대로 움직여야 다음 책으로 계속 넘어간다
      expect(nextFocusIndex(3, "right", 4, 20)).toBe(4);
      expect(nextFocusIndex(4, "left", 4, 20)).toBe(3);
    });

    it("목록 끝에서는 더 나가지 않는다", () => {
      expect(nextFocusIndex(0, "left", 4, 20)).toBe(0);
      expect(nextFocusIndex(19, "right", 4, 20)).toBe(19);
    });
  });

  describe("상하 이동", () => {
    it("열 수만큼 건너뛴다", () => {
      expect(nextFocusIndex(5, "down", 4, 20)).toBe(9);
      expect(nextFocusIndex(5, "up", 4, 20)).toBe(1);
    });

    it("첫 행에서 위로 가면 제자리에 있는다", () => {
      expect(nextFocusIndex(2, "up", 4, 20)).toBe(2);
    });

    it("마지막 행에서 아래로 가면 제자리에 있는다", () => {
      // 12~13이 마지막 행 (cols=4, total=14)
      expect(nextFocusIndex(13, "down", 4, 14)).toBe(13);
    });

    it("마지막 행이 덜 찼으면 마지막 항목으로 붙는다", () => {
      // cols=4, total=14 → 마지막 행은 12,13뿐. 11에서 아래로는 15가 없으니 13으로
      expect(nextFocusIndex(11, "down", 4, 14)).toBe(13);
    });
  });

  describe("1열(리스트 뷰)", () => {
    it("상하와 좌우가 같은 동작이 된다", () => {
      expect(nextFocusIndex(3, "down", 1, 10)).toBe(4);
      expect(nextFocusIndex(3, "right", 1, 10)).toBe(4);
      expect(nextFocusIndex(3, "up", 1, 10)).toBe(2);
      expect(nextFocusIndex(3, "left", 1, 10)).toBe(2);
    });
  });

  describe("경계값", () => {
    it("목록이 비면 포커스가 설 자리가 없다", () => {
      expect(nextFocusIndex(0, "right", 4, 0)).toBe(-1);
      expect(nextFocusIndex(-1, "down", 4, 0)).toBe(-1);
    });

    it("포커스가 없던 상태에서는 첫 항목을 잡는다", () => {
      expect(nextFocusIndex(-1, "right", 4, 20)).toBe(0);
      expect(nextFocusIndex(-1, "down", 4, 20)).toBe(0);
    });

    it("열 수가 0 이하로 들어와도 1열로 처리한다", () => {
      // 스크롤러 폭을 아직 못 잰 첫 프레임에 0이 들어올 수 있다
      expect(nextFocusIndex(3, "down", 0, 10)).toBe(4);
    });

    it("목록이 줄어 인덱스가 범위를 벗어나면 마지막 항목으로 당긴다", () => {
      expect(nextFocusIndex(99, "right", 4, 20)).toBe(19);
      expect(nextFocusIndex(99, "up", 4, 20)).toBe(15);
    });
  });
});
