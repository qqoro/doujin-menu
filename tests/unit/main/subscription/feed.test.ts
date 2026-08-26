import { describe, expect, it } from "vitest";
import {
  buildFeed,
  countNew,
  intersect,
  maxId,
} from "../../../../src/main/services/subscription/feed.js";

describe("intersect", () => {
  it("집합 하나면 그대로 돌려준다", () => {
    expect(intersect([[3, 1, 2]], [])).toEqual([3, 1, 2]);
  });

  it("여러 집합의 교집합을 낸다", () => {
    expect(
      intersect(
        [
          [1, 2, 3, 4],
          [2, 3, 5],
        ],
        [],
      ),
    ).toEqual([2, 3]);
  });

  it("첫 집합의 순서를 유지한다", () => {
    expect(
      intersect(
        [
          [4, 3, 2, 1],
          [1, 2, 3],
        ],
        [],
      ),
    ).toEqual([3, 2, 1]);
  });

  it("exclude에 있는 항목을 뺀다", () => {
    expect(intersect([[1, 2, 3]], [[2]])).toEqual([1, 3]);
  });

  it("exclude가 여러 개여도 모두 뺀다", () => {
    expect(intersect([[1, 2, 3, 4]], [[2], [4]])).toEqual([1, 3]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(intersect([], [])).toEqual([]);
  });

  it("교집합이 비면 빈 배열", () => {
    expect(intersect([[1], [2]], [])).toEqual([]);
  });
});

describe("maxId", () => {
  it("최댓값을 낸다", () => {
    expect(maxId([3, 99, 7])).toBe(99);
  });

  it("빈 배열은 null (-Infinity를 흘리지 않는다)", () => {
    expect(maxId([])).toBeNull();
  });

  it("10만 건에서도 RangeError가 나지 않는다", () => {
    // Math.max(...ids)로 구현하면 V8 인자 상한에 걸려 죽는다.
    // language:korean 실측이 98,935건이라 실제로 밟는 경로다
    const ids = Array.from({ length: 100_000 }, (_, i) => i + 1);

    expect(() => maxId(ids)).not.toThrow();
    expect(maxId(ids)).toBe(100_000);
  });
});

describe("countNew", () => {
  it("워터마크를 넘는 건수를 센다", () => {
    expect(countNew([10, 20, 30], 15)).toBe(2);
  });

  it("워터마크가 null이면 0 (기준선 미설정)", () => {
    // 첫 폴링은 기준선만 잡고 신작으로 치지 않는다
    expect(countNew([10, 20, 30], null)).toBe(0);
  });

  it("전부 워터마크 이하면 0", () => {
    expect(countNew([10, 20], 20)).toBe(0);
  });

  it("빈 배열은 0", () => {
    expect(countNew([], 5)).toBe(0);
  });
});

describe("buildFeed", () => {
  it("ID 내림차순으로 정렬한다", () => {
    expect([...buildFeed([[1, 5, 3]])]).toEqual([5, 3, 1]);
  });

  it("구독 간 중복을 제거한다", () => {
    expect([
      ...buildFeed([
        [1, 2],
        [2, 3],
      ]),
    ]).toEqual([3, 2, 1]);
  });

  it("입력 순서와 무관하게 같은 결과를 낸다", () => {
    // 이 성질이 설계 전제다. nozomi 파일 순서를 신뢰하지 않는다
    const ascending = [
      [1, 2, 3],
      [4, 5],
    ];
    const descending = [
      [3, 2, 1],
      [5, 4],
    ];
    const shuffled = [
      [2, 3, 1],
      [5, 4],
    ];

    const expected = [5, 4, 3, 2, 1];
    expect([...buildFeed(ascending)]).toEqual(expected);
    expect([...buildFeed(descending)]).toEqual(expected);
    expect([...buildFeed(shuffled)]).toEqual(expected);
  });

  it("구독이 없으면 빈 배열", () => {
    expect([...buildFeed([])]).toEqual([]);
  });

  it("Int32Array로 돌려준다 (건당 4바이트)", () => {
    expect(buildFeed([[1, 2]])).toBeInstanceOf(Int32Array);
  });
});
