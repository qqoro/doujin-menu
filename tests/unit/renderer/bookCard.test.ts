import { describe, expect, it } from "vitest";
import {
  buildBookMenuItems,
  buildBookMetaLine,
  buildCoverUrl,
  filterValidNames,
  hasCreatorInfo,
} from "../../../src/renderer/lib/bookCard";

describe("filterValidNames", () => {
  it("정상 이름은 그대로 통과", () => {
    expect(filterValidNames([{ name: "alpha" }, { name: "beta" }])).toEqual([
      { name: "alpha" },
      { name: "beta" },
    ]);
  });

  it("빈 문자열 제외", () => {
    expect(filterValidNames([{ name: "alpha" }, { name: "" }])).toEqual([
      { name: "alpha" },
    ]);
  });

  it("공백만 있는 이름 제외", () => {
    expect(filterValidNames([{ name: "alpha" }, { name: "   " }])).toEqual([
      { name: "alpha" },
    ]);
  });

  it("undefined 목록 → 빈 배열", () => {
    expect(filterValidNames(undefined)).toEqual([]);
  });

  it("null 목록 → 빈 배열", () => {
    expect(filterValidNames(null)).toEqual([]);
  });

  it("빈 목록 → 빈 배열", () => {
    expect(filterValidNames([])).toEqual([]);
  });

  it("이름이 없는 항목 제외", () => {
    expect(
      filterValidNames([{ name: "alpha" }, {} as { name: string }]),
    ).toEqual([{ name: "alpha" }]);
  });

  it("원본 배열을 변형하지 않음", () => {
    const original = [{ name: "alpha" }, { name: "" }];
    filterValidNames(original);
    expect(original).toHaveLength(2);
  });
});

describe("buildCoverUrl", () => {
  it("표지 경로가 없으면 빈 문자열", () => {
    expect(buildCoverUrl(null, 0)).toBe("");
    expect(buildCoverUrl(undefined, 0)).toBe("");
    expect(buildCoverUrl("", 0)).toBe("");
  });

  it("버전이 0이면 쿼리 없이 file:// 경로", () => {
    expect(buildCoverUrl("/thumb/a.webp", 0)).toBe("file:///thumb/a.webp");
  });

  it("버전이 있으면 캐시 무효화 쿼리를 붙임", () => {
    expect(buildCoverUrl("/thumb/a.webp", 1234)).toBe(
      "file:///thumb/a.webp?v=1234",
    );
  });

  it("버전이 바뀌면 URL도 바뀜 (재스캔 후 썸네일 갱신)", () => {
    expect(buildCoverUrl("/thumb/a.webp", 1)).not.toBe(
      buildCoverUrl("/thumb/a.webp", 2),
    );
  });
});

describe("hasCreatorInfo", () => {
  it("작가만 있어도 true", () => {
    expect(hasCreatorInfo([{ name: "alpha" }], [])).toBe(true);
  });

  it("그룹만 있어도 true", () => {
    expect(hasCreatorInfo([], [{ name: "group1" }])).toBe(true);
  });

  it("둘 다 없으면 false", () => {
    expect(hasCreatorInfo([], [])).toBe(false);
  });
});

describe("buildBookMetaLine", () => {
  const FULL = {
    page_count: 24,
    type: "manga",
    language_name_local: "한국어",
    language_name_english: "Korean",
    added_at: "2026-08-14T09:00:00.000Z",
    hitomi_id: "123456",
  };

  it("요청한 필드만 요청한 순서로 만든다", () => {
    expect(buildBookMetaLine(FULL, ["pages", "type"])).toEqual([
      { key: "pages", text: "24p" },
      { key: "type", text: "manga" },
    ]);
  });

  it("현지어 언어 이름을 우선한다", () => {
    expect(buildBookMetaLine(FULL, ["language"])).toEqual([
      { key: "language", text: "한국어" },
    ]);
    expect(
      buildBookMetaLine({ language_name_english: "Korean" }, ["language"]),
    ).toEqual([{ key: "language", text: "Korean" }]);
  });

  // 정보가 적은 책에서 `· · ·`만 남은 줄이 나오면 안 된다
  it("값이 없는 항목은 자리를 안 남기고 빠진다", () => {
    expect(
      buildBookMetaLine({ page_count: 0 }, [
        "pages",
        "type",
        "language",
        "date",
        "id",
      ]),
    ).toEqual([]);
  });

  // 갤러리와 달리 라이브러리 책은 hitomi_id가 없을 수 있다
  it("hitomi_id가 없으면 ID를 안 그린다", () => {
    expect(buildBookMetaLine({ hitomi_id: "7" }, ["id"])).toEqual([
      { key: "id", text: "#7" },
    ]);
    expect(buildBookMetaLine({}, ["id"])).toEqual([]);
  });

  it("추가 날짜를 YYYY.MM.DD로 그린다", () => {
    const [part] = buildBookMetaLine({ added_at: "2026-08-14" }, ["date"]);
    expect(part).toEqual({ key: "date", text: "2026.08.14" });
  });

  it("날짜가 유효하지 않으면 뺀다", () => {
    expect(buildBookMetaLine({ added_at: "날짜 아님" }, ["date"])).toEqual([]);
  });
});

describe("buildBookMenuItems", () => {
  const noop = () => {};
  const ACTIONS = {
    favorite: noop,
    folder: noop,
    newWindow: noop,
    external: noop,
    details: noop,
    preview: noop,
    rescan: noop,
    delete: noop,
  };
  const FLAGS = {
    isFavorite: false,
    hasExternalViewer: false,
    isRescanning: false,
  };

  it("외부 뷰어 경로가 없으면 그 항목을 빼고 일곱 개", () => {
    const keys = buildBookMenuItems(FLAGS, ACTIONS).map((item) => item.key);
    expect(keys).toEqual([
      "favorite",
      "folder",
      "new-window",
      "details",
      "preview",
      "rescan",
      "delete",
    ]);
  });

  it("외부 뷰어가 설정돼 있으면 새 창 다음에 끼워 넣는다", () => {
    const keys = buildBookMenuItems(
      { ...FLAGS, hasExternalViewer: true },
      ACTIONS,
    ).map((item) => item.key);
    expect(keys[3]).toBe("external");
    expect(keys).toHaveLength(8);
  });

  it("즐겨찾기 여부로 문구와 아이콘이 뒤집힌다", () => {
    const off = buildBookMenuItems(FLAGS, ACTIONS)[0];
    const on = buildBookMenuItems({ ...FLAGS, isFavorite: true }, ACTIONS)[0];
    expect(off.label).toBe("즐겨찾기 추가");
    expect(on.label).toBe("즐겨찾기 해제");
    expect(on.icon).not.toBe(off.icon);
  });

  it("재스캔 중에는 아이콘이 돈다", () => {
    const idle = buildBookMenuItems(FLAGS, ACTIONS).find(
      (item) => item.key === "rescan",
    );
    const busy = buildBookMenuItems(
      { ...FLAGS, isRescanning: true },
      ACTIONS,
    ).find((item) => item.key === "rescan");
    expect(idle?.iconClass).toBeUndefined();
    expect(busy?.iconClass).toBe("animate-spin");
  });

  // 삭제만 구분선 위에 둔다. 두 메뉴가 같은 배열을 그리므로 여기서 한 번만 정한다
  it("구분선은 삭제 앞에만 있다", () => {
    const marked = buildBookMenuItems(FLAGS, ACTIONS)
      .filter((item) => item.separatorBefore)
      .map((item) => item.key);
    expect(marked).toEqual(["delete"]);
  });

  it("항목의 action이 넘긴 함수 그대로다", () => {
    const calls: string[] = [];
    const items = buildBookMenuItems(FLAGS, {
      ...ACTIONS,
      folder: () => calls.push("folder"),
      delete: () => calls.push("delete"),
    });
    items.find((item) => item.key === "folder")?.action();
    items.find((item) => item.key === "delete")?.action();
    expect(calls).toEqual(["folder", "delete"]);
  });
});
