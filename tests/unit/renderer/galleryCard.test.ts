import { describe, expect, it } from "vitest";
import {
  buildMetaLine,
  listRowEstimate,
  listThumbnailSize,
  resolveCardStatus,
} from "../../../src/renderer/lib/galleryCard";

describe("resolveCardStatus", () => {
  it("라이브러리에 있으면 보유중이 다른 무엇보다 우선한다", () => {
    const status = resolveCardStatus({
      bookId: 42,
      status: "progress",
      progress: 30,
    });
    expect(status.kind).toBe("owned");
    expect(status.badgeLabel).toBe("보유중");
    expect(status.buttonLabel).toBe("완료");
  });

  // 다운로드가 방금 끝나면 bookId 재조회가 오기 전이라 status만 completed다.
  // 둘을 같은 표현으로 묶어야 배지가 깜빡이지 않는다.
  it("방금 완료도 보유중과 같은 표현을 쓴다", () => {
    expect(resolveCardStatus({ bookId: null, status: "completed" })).toEqual(
      resolveCardStatus({ bookId: 7, status: "idle" }),
    );
  });

  it("진행 중이면 퍼센트를 배지와 버튼에 똑같이 쓴다", () => {
    const status = resolveCardStatus({
      bookId: null,
      status: "progress",
      progress: 62,
    });
    expect(status.kind).toBe("downloading");
    expect(status.badgeLabel).toBe("62%");
    expect(status.buttonLabel).toBe("62%");
    expect(status.percent).toBe(62);
    expect(status.indeterminate).toBe(false);
  });

  it("progress가 없는 진행 상태는 퍼센트 대신 문구를 쓴다", () => {
    expect(
      resolveCardStatus({ bookId: null, status: "starting" }),
    ).toMatchObject({
      kind: "downloading",
      badgeLabel: "시작 중",
      percent: null,
      indeterminate: true,
    });
    expect(
      resolveCardStatus({ bookId: null, status: "pending" }),
    ).toMatchObject({
      badgeLabel: "대기",
      percent: null,
      indeterminate: false,
    });
    expect(resolveCardStatus({ bookId: null, status: "paused" })).toMatchObject(
      {
        badgeLabel: "일시정지",
        indeterminate: false,
      },
    );
  });

  it("일시정지는 마지막 진행률을 유지한다", () => {
    expect(
      resolveCardStatus({ bookId: null, status: "paused", progress: 40 })
        .percent,
    ).toBe(40);
  });

  it("실패는 배지와 버튼 모두 실패", () => {
    const status = resolveCardStatus({ bookId: null, status: "failed" });
    expect(status.kind).toBe("failed");
    expect(status.badgeLabel).toBe("실패");
    expect(status.buttonLabel).toBe("실패");
  });

  // 아무 상태도 아닌 카드에까지 배지를 달면 목록이 배지밭이 된다
  it("기본 상태는 배지를 달지 않는다", () => {
    const status = resolveCardStatus({ bookId: null, status: "idle" });
    expect(status.kind).toBe("idle");
    expect(status.badgeLabel).toBeNull();
    expect(status.buttonLabel).toBe("다운로드");
  });

  it("퍼센트는 0~100으로 자른다", () => {
    expect(
      resolveCardStatus({ bookId: null, status: "progress", progress: 140 })
        .percent,
    ).toBe(100);
    expect(
      resolveCardStatus({ bookId: null, status: "progress", progress: -5 })
        .percent,
    ).toBe(0);
  });
});

describe("buildMetaLine", () => {
  const FULL = {
    id: 3184920,
    type: "manga",
    files: new Array(32),
    languageName: { local: "한국어", english: "Korean" },
    publishedDate: new Date(2026, 7, 3, 10, 0, 0),
  };

  it("요청한 필드만 요청한 순서로 낸다", () => {
    expect(buildMetaLine(FULL, ["pages", "language", "date"])).toEqual([
      { key: "pages", text: "32p" },
      { key: "language", text: "한국어" },
      { key: "date", text: "2026.08.03" },
    ]);
  });

  it("리스트는 타입과 ID까지 붙인다", () => {
    expect(
      buildMetaLine(FULL, ["pages", "type", "language", "date", "id"]).map(
        (part) => part.text,
      ),
    ).toEqual(["32p", "manga", "한국어", "2026.08.03", "#3184920"]);
  });

  // 값이 없는 항목까지 자리를 차지하면 "· · ·"만 남은 줄이 나옵니다
  it("값이 없는 항목은 통째로 뺀다", () => {
    const sparse = { id: 1, files: [], languageName: undefined };
    expect(
      buildMetaLine(sparse, ["pages", "type", "language", "date", "id"]),
    ).toEqual([{ key: "id", text: "#1" }]);
  });

  it("현지어 이름이 없으면 영어 이름으로 떨어진다", () => {
    const enOnly = { id: 1, languageName: { english: "Korean" } };
    expect(buildMetaLine(enOnly, ["language"])).toEqual([
      { key: "language", text: "Korean" },
    ]);
  });

  it("날짜가 유효하지 않으면 뺀다", () => {
    const bad = { id: 1, publishedDate: "말도 안 되는 값" };
    expect(buildMetaLine(bad, ["date"])).toEqual([]);
  });

  it("ID는 항상 남는다", () => {
    expect(buildMetaLine({ id: 99 }, ["id"])).toEqual([
      { key: "id", text: "#99" },
    ]);
  });
});

describe("listThumbnailSize", () => {
  it("기본 줌에서 128px, 3:4 비율", () => {
    expect(listThumbnailSize(1)).toEqual({ width: 128, height: 171 });
  });

  // uiStore의 줌 범위가 0.4~1.5입니다
  it("최소·최대 줌 경계", () => {
    expect(listThumbnailSize(0.4)).toEqual({ width: 51, height: 68 });
    expect(listThumbnailSize(1.5)).toEqual({ width: 192, height: 256 });
  });

  // localStorage가 비었거나 오염되면 0이나 NaN이 들어옵니다
  it("줌 값이 망가져 있으면 1로 취급한다", () => {
    expect(listThumbnailSize(0)).toEqual(listThumbnailSize(1));
    expect(listThumbnailSize(Number.NaN)).toEqual(listThumbnailSize(1));
    expect(listThumbnailSize(-2)).toEqual(listThumbnailSize(1));
  });
});

describe("listRowEstimate", () => {
  // 초기 추정이 줌을 안 따라가면 최소 줌에서 총 높이가 세 배 넘게 어긋나
  // 스크롤바 길이와 실제 내용이 따로 놉니다
  it("줌이 커지면 추정 높이도 커진다", () => {
    expect(listRowEstimate(1.5)).toBeGreaterThan(listRowEstimate(1));
    expect(listRowEstimate(1)).toBeGreaterThan(listRowEstimate(0.4));
  });

  // 썸네일을 아무리 줄여도 제목·메타·크레딧·태그가 차지하는 바닥이 있습니다
  it("썸네일이 작아져도 본문 최소 높이 아래로는 안 내려간다", () => {
    expect(listRowEstimate(0.4)).toBeGreaterThanOrEqual(150);
  });

  it("기본 줌에서 썸네일 높이보다 크다", () => {
    expect(listRowEstimate(1)).toBeGreaterThan(listThumbnailSize(1).height);
  });
});
