import { describe, expect, it } from "vitest";
import {
  computeGroupHighlight,
  filterGroups,
  formatBytes,
  groupReclaimableSize,
  groupTitle,
  matchTypeBadgeVariant,
  matchTypeLabel,
  sortGroups,
  summarizeGroups,
} from "@/lib/duplicateCompare";
import type { DuplicateBookInfo, DuplicateGroup } from "../../../src/types/ipc";

const book = (
  overrides: Partial<DuplicateBookInfo> & { id: number },
): DuplicateBookInfo =>
  ({
    title: "제목",
    path: `/lib/${overrides.id}`,
    isArchive: true,
    file_size: null,
    file_mtime: null,
    is_favorite: false,
    artists: [],
    tags: [],
    series: [],
    groups: [],
    characters: [],
    ...overrides,
  }) as DuplicateBookInfo;

const group = (
  books: DuplicateBookInfo[],
  overrides: Partial<DuplicateGroup> = {},
): DuplicateGroup => ({
  key: "key",
  matchType: "title",
  books,
  ...overrides,
});

describe("formatBytes", () => {
  it("1GB 미만은 소수점 없이 표기", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(340 * 1024 * 1024)).toBe("340 MB");
  });

  it("GB 이상은 소수점 한 자리", () => {
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });

  it("0과 음수는 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });
});

describe("computeGroupHighlight", () => {
  it("값이 다르면 최대값을 강조 대상으로 준다", () => {
    const highlight = computeGroupHighlight([
      book({ id: 1, page_count: 220, file_size: 300 }),
      book({ id: 2, page_count: 218, file_size: 120 }),
    ]);

    expect(highlight.bestPageCount).toBe(220);
    expect(highlight.bestFileSize).toBe(300);
  });

  it("값이 전부 같으면 강조하지 않는다 (없는 우열을 만들지 않음)", () => {
    const highlight = computeGroupHighlight([
      book({ id: 1, page_count: 220, file_size: 300 }),
      book({ id: 2, page_count: 220, file_size: 300 }),
    ]);

    expect(highlight.bestPageCount).toBeNull();
    expect(highlight.bestFileSize).toBeNull();
  });

  it("비교할 값이 하나뿐이면 강조하지 않는다", () => {
    const highlight = computeGroupHighlight([
      book({ id: 1, file_size: 300 }),
      book({ id: 2, file_size: null }),
    ]);

    expect(highlight.bestFileSize).toBeNull();
  });
});

describe("groupReclaimableSize", () => {
  it("가장 큰 사본을 남긴다고 보고 나머지를 더한다", () => {
    expect(
      groupReclaimableSize([
        book({ id: 1, file_size: 300 }),
        book({ id: 2, file_size: 120 }),
        book({ id: 3, file_size: 100 }),
      ]),
    ).toBe(220);
  });

  it("용량 미상 사본이 하나라도 있으면 null (일부만 더하면 실제보다 작게 보인다)", () => {
    expect(
      groupReclaimableSize([
        book({ id: 1, file_size: 300 }),
        book({ id: 2, file_size: null }),
      ]),
    ).toBeNull();
  });
});

describe("summarizeGroups", () => {
  it("계산 가능한 그룹만 합산하고 미상 그룹 수를 따로 센다", () => {
    const summary = summarizeGroups([
      group([book({ id: 1, file_size: 300 }), book({ id: 2, file_size: 100 })]),
      group([
        book({ id: 3, file_size: null }),
        book({ id: 4, file_size: 100 }),
      ]),
    ]);

    expect(summary.groupCount).toBe(2);
    expect(summary.bookCount).toBe(4);
    expect(summary.reclaimableSize).toBe(100);
    expect(summary.unknownSizeGroups).toBe(1);
  });
});

describe("sortGroups", () => {
  it("절약 용량순은 큰 것부터, 용량 미상 그룹은 맨 뒤", () => {
    const small = group(
      [book({ id: 1, file_size: 200 }), book({ id: 2, file_size: 100 })],
      { key: "small" },
    );
    const big = group(
      [book({ id: 3, file_size: 900 }), book({ id: 4, file_size: 800 })],
      { key: "big" },
    );
    const unknown = group(
      [book({ id: 5, file_size: null }), book({ id: 6, file_size: 100 })],
      { key: "unknown" },
    );

    const sorted = sortGroups([unknown, small, big], "reclaimable");
    expect(sorted.map((g) => g.key)).toEqual(["big", "small", "unknown"]);
  });

  it("사본 수순은 많은 것부터", () => {
    const two = group([book({ id: 1 }), book({ id: 2 })], { key: "two" });
    const three = group([book({ id: 3 }), book({ id: 4 }), book({ id: 5 })], {
      key: "three",
    });

    expect(sortGroups([two, three], "count").map((g) => g.key)).toEqual([
      "three",
      "two",
    ]);
  });
});

describe("filterGroups", () => {
  const groups = [
    group(
      [book({ id: 1, title: "밤의 이야기", artists: [{ name: "작가A" }] })],
      {
        key: "a",
        matchType: "title",
      },
    ),
    group([book({ id: 2, title: "낮의 기록", artists: [{ name: "작가B" }] })], {
      key: "b",
      matchType: "hitomi_id",
    }),
    group([book({ id: 3, title: "새벽 무렵 (decensored)" })], {
      key: "c",
      matchType: "title_normalized",
    }),
    group([book({ id: 4, title: "표지만 같은 책" })], {
      key: "d",
      matchType: "cover_hash",
    }),
  ];

  it("매치 타입으로 거른다", () => {
    expect(filterGroups(groups, "", "hitomi_id").map((g) => g.key)).toEqual([
      "b",
    ]);
  });

  it("정규화 그룹만 따로 거를 수 있다", () => {
    expect(
      filterGroups(groups, "", "title_normalized").map((g) => g.key),
    ).toEqual(["c"]);
  });

  it("표지 그룹만 따로 거를 수 있다", () => {
    expect(filterGroups(groups, "", "cover_hash").map((g) => g.key)).toEqual([
      "d",
    ]);
  });

  it("전체를 고르면 정규화 그룹도 함께 나온다", () => {
    expect(filterGroups(groups, "", "all").map((g) => g.key)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("제목으로 찾는다", () => {
    expect(filterGroups(groups, "밤의", "all").map((g) => g.key)).toEqual([
      "a",
    ]);
  });

  it("작가로도 찾는다", () => {
    expect(filterGroups(groups, "작가B", "all").map((g) => g.key)).toEqual([
      "b",
    ]);
  });

  it("사본 하나만 맞아도 그룹째 남긴다 (행을 걸러내면 중복 개수가 왜곡된다)", () => {
    const mixed = group(
      [book({ id: 3, title: "아침" }), book({ id: 4, title: "저녁" })],
      { key: "mixed" },
    );

    const result = filterGroups([mixed], "저녁", "all");
    expect(result).toHaveLength(1);
    expect(result[0].books).toHaveLength(2);
  });
});

describe("groupTitle", () => {
  it("hitomi_id 그룹은 key가 숫자라 첫 사본 제목을 쓴다", () => {
    const g = group([book({ id: 1, title: "어떤 작품" })], {
      key: "123456",
      matchType: "hitomi_id",
    });
    expect(groupTitle(g)).toBe("어떤 작품");
  });

  it("정규화 그룹은 key가 정규화 문자열이라 첫 사본 제목을 쓴다", () => {
    const g = group([book({ id: 1, title: "배수진 (decensored)" })], {
      key: "haisuinojin배수진",
      matchType: "title_normalized",
    });
    expect(groupTitle(g)).toBe("배수진 (decensored)");
  });
});

describe("matchTypeLabel / matchTypeBadgeVariant", () => {
  it("매치 타입마다 라벨이 있다", () => {
    expect(matchTypeLabel("hitomi_id")).toBe("ID 일치");
    expect(matchTypeLabel("title")).toBe("제목 일치");
    expect(matchTypeLabel("title_normalized")).toBe("제목 유사");
    expect(matchTypeLabel("cover_hash")).toBe("표지 유사");
  });

  it("근거가 확실한 순으로 배지 색이 갈린다", () => {
    expect(matchTypeBadgeVariant("hitomi_id")).toBe("default");
    expect(matchTypeBadgeVariant("title")).toBe("secondary");
    expect(matchTypeBadgeVariant("title_normalized")).toBe("outline");
    expect(matchTypeBadgeVariant("cover_hash")).toBe("ghost");
  });

  it("네 타입의 배지 색이 서로 겹치지 않는다", () => {
    const variants = (
      ["hitomi_id", "title", "title_normalized", "cover_hash"] as const
    ).map(matchTypeBadgeVariant);
    expect(new Set(variants).size).toBe(4);
  });
});
