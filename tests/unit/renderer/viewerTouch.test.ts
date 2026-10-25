import { describe, expect, it } from "vitest";
import { classifyTap } from "@/lib/viewerTouch";

const base = {
  pointerType: "touch",
  insideControls: false,
  isAutoPlay: false,
  clientX: 200,
  width: 400,
  hasSideZones: true,
};

describe("classifyTap", () => {
  it("마우스 클릭은 무시한다", () => {
    expect(classifyTap({ ...base, pointerType: "mouse" })).toBe("ignore");
  });

  it("컨트롤 바 안의 탭은 자동 넘김 중이어도 무시한다 (칩으로 간격만 바꾼다)", () => {
    expect(
      classifyTap({ ...base, insideControls: true, isAutoPlay: true }),
    ).toBe("ignore");
  });

  it("자동 넘김 중에는 좌우 영역을 탭해도 넘기지 않고 멈춘다", () => {
    expect(classifyTap({ ...base, isAutoPlay: true, clientX: 10 })).toBe(
      "stop-autoplay",
    );
  });

  it("좌우 1/4은 페이지 넘김 영역, 가운데는 컨트롤 토글", () => {
    expect(classifyTap({ ...base, clientX: 50 })).toBe("zone");
    expect(classifyTap({ ...base, clientX: 200 })).toBe("toggle-controls");
    expect(classifyTap({ ...base, clientX: 390 })).toBe("zone");
  });

  it("좌우 영역이 없는 웹툰 모드는 어디를 탭해도 컨트롤 토글", () => {
    expect(classifyTap({ ...base, hasSideZones: false, clientX: 10 })).toBe(
      "toggle-controls",
    );
  });

  it("좌우 영역은 최대 500px", () => {
    expect(classifyTap({ ...base, width: 2400, clientX: 550 })).toBe(
      "toggle-controls",
    );
  });
});
