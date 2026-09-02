import { describe, expect, it } from "vitest";
import { normalizeTitleKey } from "../../../src/main/services/duplicateDetection/titleKey";

/** 두 제목이 같은 중복 그룹으로 묶이는지 */
const groups = (a: string, b: string) =>
  normalizeTitleKey(a) !== "" && normalizeTitleKey(a) === normalizeTitleKey(b);

describe("titleKey/normalizeTitleKey", () => {
  it("무수정판 표기만 다른 제목을 같은 키로 묶어야 합니다", () => {
    expect(
      groups("Haisui no Jin | 배수진 (decensored)", "Haisui no Jin | 배수진"),
    ).toBe(true);
    expect(
      groups(
        "Junai Strategy | 순애 스트래티지",
        "Junai Strategy | 순애 스트래티지 (decensored)",
      ),
    ).toBe(true);
  });

  it("대소문자 차이를 무시해야 합니다", () => {
    expect(groups("DisLove (decensored)", "Dislove (decensored)")).toBe(true);
  });

  it("공백과 구분 기호 차이를 무시해야 합니다", () => {
    expect(
      groups(
        "FOX EATS de-su | FOX EATS  입니다♡",
        "FOX EATS de-su   FOX EATS  입니다♡",
      ),
    ).toBe(true);
    expect(groups("abcd", "ab cd")).toBe(true);
    expect(
      groups(
        "JC Chinpo-beya Ikkagetsu Seikatsu Challenge!!",
        "JC Chinpo-beya Ikkagetsu Seikatsu Challenge!",
      ),
    ).toBe(true);
  });

  it("작가·언어 등 부가 괄호를 제거해 같은 작품으로 묶어야 합니다", () => {
    expect(
      groups("Meyling", "Meyling (Girls' Frontline) [Korean] (uncensored)"),
    ).toBe(true);
    expect(groups("[작가] 제목", "제목")).toBe(true);
  });

  it("숫자 권차가 든 괄호는 남겨 서로 다른 권을 분리해야 합니다", () => {
    const base = "1-kagetsu Ninshin Shinakereba Otoko ni Modoreru Hanashi";
    expect(groups(`${base} (2) | 한 달`, `${base} (3) | 한 달`)).toBe(false);
    expect(groups(`${base} (3) | 한 달`, `${base} (4) | 한 달`)).toBe(false);
  });

  it("로마자 권차 표기가 든 괄호도 남겨야 합니다", () => {
    expect(
      groups(
        "Koharu-chan wa Seichouki! (Ge)",
        "Koharu-chan wa Seichouki! (Jou)",
      ),
    ).toBe(false);
  });

  it("한글·한자 상하권 표기가 든 괄호도 남겨야 합니다", () => {
    expect(groups("제목 (상)", "제목 (하)")).toBe(false);
    expect(groups("제목 (上)", "제목 (下)")).toBe(false);
  });

  it("괄호를 걷어내면 남는 게 없는 제목은 빈 키를 돌려줘야 합니다", () => {
    // 이모지만 남는 제목끼리 "(decensored)"로 묶이는 오탐을 막는다
    expect(normalizeTitleKey("🐺 (decensored)")).toBe("");
    expect(normalizeTitleKey("🎃 (decensored)")).toBe("");
  });

  it("전각 문자를 반각으로 통일해야 합니다", () => {
    expect(groups("ＴＥＳＴ　１", "test 1")).toBe(true);
  });

  it("빈 제목과 공백뿐인 제목은 빈 키를 돌려줘야 합니다", () => {
    expect(normalizeTitleKey("")).toBe("");
    expect(normalizeTitleKey("   ")).toBe("");
  });
});

describe("titleKey/normalizeTitleKey - 괄호 처리 경계", () => {
  it("중첩 괄호를 남김없이 걷어내야 합니다", () => {
    expect(groups("[서클 (작가)] 제목", "제목")).toBe(true);
  });

  it("짝이 맞지 않는 괄호가 섞여도 꼬리표를 걷어내야 합니다", () => {
    // 실제 라이브러리에 있던 표기. 여는 괄호와 닫는 괄호 종류가 어긋나 있다
    expect(
      groups(
        "Meyling (Girls' Frontline) [Korean] {Uncensored] (uncensored)",
        "Meyling",
      ),
    ).toBe(true);
  });

  it("전각 괄호도 반각과 같게 다뤄야 합니다", () => {
    expect(groups("제목（상）", "제목 (상)")).toBe(true);
    expect(groups("제목（상）", "제목（하）")).toBe(false);
  });

  it("꺾쇠 괄호 꼬리표도 걷어내야 합니다", () => {
    expect(groups("제목 【완결】", "제목")).toBe(true);
  });

  it("빈 괄호와 공백뿐인 괄호는 그냥 사라져야 합니다", () => {
    expect(normalizeTitleKey("제목 ()")).toBe("제목");
    expect(normalizeTitleKey("제목 (   )")).toBe("제목");
  });

  it("닫히지 않은 괄호는 내용을 지우지 않아야 합니다", () => {
    // 지워버리면 제목 뒷부분이 통째로 날아가 엉뚱한 책과 묶인다
    expect(normalizeTitleKey("제목 (미완")).toBe("제목미완");
  });
});

describe("titleKey/normalizeTitleKey - 권차 표기 판별", () => {
  it("권차 표기를 품고만 있는 평범한 꼬리표는 권차로 보지 않아야 합니다", () => {
    // '하렘'의 '하', '전연령'의 '전'이 권차로 오인되면 같은 작품이 갈라진다
    expect(groups("제목 (하렘)", "제목")).toBe(true);
    expect(groups("제목 (전연령)", "제목")).toBe(true);
    expect(groups("제목 (상상)", "제목")).toBe(true);
  });

  it("영문 단어에 우연히 들어간 권차 철자를 권차로 보지 않아야 합니다", () => {
    expect(groups("제목 (George)", "제목")).toBe(true);
    expect(groups("제목 (Frozen)", "제목")).toBe(true);
    expect(groups("제목 (chapter)", "제목")).toBe(true);
  });

  it("괄호 내용 전체가 권차 표기면 남겨야 합니다", () => {
    expect(groups("제목 (상권)", "제목 (하권)")).toBe(false);
    expect(groups("제목 (전편)", "제목 (후편)")).toBe(false);
    expect(groups("제목 (Ge)", "제목 (Jou)")).toBe(false);
  });

  it("숫자는 괄호 어디에 있어도 권차로 봐야 합니다", () => {
    expect(groups("제목 (vol.1)", "제목 (vol.2)")).toBe(false);
    expect(groups("제목 (2화)", "제목 (3화)")).toBe(false);
  });

  it("괄호 밖 숫자는 원래 키에 남아 권을 구분합니다", () => {
    expect(groups("제목 2권", "제목 3권")).toBe(false);
  });
});
