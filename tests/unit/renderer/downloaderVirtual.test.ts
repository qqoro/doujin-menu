import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  chunksForRange,
  clampPage,
  computeGridMetrics,
  computeListCols,
  getOffset,
  getPageCount,
  getShownCount,
  locateNth,
  PAGE,
  shouldShowSkeleton,
  visibleRange,
} from "../../../src/renderer/lib/downloaderVirtual";

/** 언어 "전체"의 실측 총 건수 (2026-08-11) */
const TOTAL_ALL = 1_191_155;
/** 한국어 검색의 실측 총 건수 */
const TOTAL_KOREAN = 98_640;
/** 한 구간에 들어가는 규모 */
const TOTAL_SMALL = 3_000;

/** 마지막 구간 번호 (0-based) */
const LAST_PAGE_ALL = getPageCount(TOTAL_ALL) - 1;

describe("getPageCount", () => {
  it("한 구간에 들어가는 규모는 구간이 하나뿐이다", () => {
    expect(getPageCount(TOTAL_SMALL)).toBe(1);
  });

  it("평소 쓰는 한국어 검색도 여러 구간으로 나뉜다", () => {
    expect(getPageCount(TOTAL_KOREAN)).toBe(Math.ceil(TOTAL_KOREAN / PAGE));
    expect(getPageCount(TOTAL_KOREAN)).toBeGreaterThan(1);
  });

  it("실측 120만 건은 여러 구간으로 나뉜다", () => {
    expect(getPageCount(TOTAL_ALL)).toBe(Math.ceil(TOTAL_ALL / PAGE));
  });

  it("결과가 없어도 1을 반환해 구간 계산이 무너지지 않는다", () => {
    expect(getPageCount(0)).toBe(1);
  });

  it("정확히 경계에 떨어지면 구간을 더 만들지 않는다", () => {
    expect(getPageCount(PAGE)).toBe(1);
    expect(getPageCount(PAGE + 1)).toBe(2);
  });
});

describe("getShownCount", () => {
  it("중간 구간은 꽉 찬다", () => {
    expect(getShownCount(TOTAL_ALL, 0)).toBe(PAGE);
    expect(getShownCount(TOTAL_ALL, 6)).toBe(PAGE);
  });

  it("마지막 구간은 남은 만큼만 보여준다", () => {
    expect(getShownCount(TOTAL_ALL, LAST_PAGE_ALL)).toBe(
      TOTAL_ALL - getOffset(LAST_PAGE_ALL),
    );
    expect(getShownCount(TOTAL_ALL, LAST_PAGE_ALL)).toBeLessThan(PAGE);
  });

  it("total보다 작으면 전부 보여준다", () => {
    expect(getShownCount(TOTAL_SMALL, 0)).toBe(TOTAL_SMALL);
  });

  it("범위를 넘는 구간은 0이다 (음수가 나오면 안 된다)", () => {
    expect(getShownCount(TOTAL_ALL, LAST_PAGE_ALL + 1)).toBe(0);
    expect(getShownCount(TOTAL_ALL, 99_999)).toBe(0);
  });

  // 이걸 min(total, PAGE)로 쓰면 구간을 바꿔도 매번 앞 PAGE건만 보게 됩니다.
  it("구간이 바뀌면 offset만큼 뒤를 본다", () => {
    expect(getOffset(6)).toBe(6 * PAGE);
    expect(getOffset(6) + getShownCount(TOTAL_ALL, 6)).toBe(7 * PAGE);
  });
});

describe("clampPage", () => {
  it("범위를 벗어난 구간 번호를 잘라낸다", () => {
    expect(clampPage(-3, TOTAL_ALL)).toBe(0);
    expect(clampPage(99_999, TOTAL_ALL)).toBe(LAST_PAGE_ALL);
    expect(clampPage(5, TOTAL_SMALL)).toBe(0);
  });
});

describe("locateNth", () => {
  it("1번째는 첫 구간의 0번 인덱스", () => {
    expect(locateNth(1, TOTAL_ALL)).toEqual({ page: 0, localIndex: 0 });
  });

  it("구간 경계를 정확히 가른다", () => {
    // 5구간의 마지막 항목과 6구간의 첫 항목
    expect(locateNth(5 * PAGE, TOTAL_ALL)).toEqual({
      page: 4,
      localIndex: PAGE - 1,
    });
    expect(locateNth(5 * PAGE + 1, TOTAL_ALL)).toEqual({
      page: 5,
      localIndex: 0,
    });
  });

  it("마지막 항목까지 도달할 수 있다", () => {
    expect(locateNth(TOTAL_ALL, TOTAL_ALL)).toEqual({
      page: LAST_PAGE_ALL,
      localIndex: TOTAL_ALL - 1 - getOffset(LAST_PAGE_ALL),
    });
  });

  it("범위 밖이거나 숫자가 아니면 null", () => {
    expect(locateNth(0, TOTAL_ALL)).toBeNull();
    expect(locateNth(-1, TOTAL_ALL)).toBeNull();
    expect(locateNth(TOTAL_ALL + 1, TOTAL_ALL)).toBeNull();
    expect(locateNth(Number.NaN, TOTAL_ALL)).toBeNull();
  });
});

describe("chunksForRange", () => {
  it("한 청크 안에 들어가면 하나만 반환한다", () => {
    expect(chunksForRange(0, CHUNK_SIZE - 1)).toEqual([0]);
  });

  it("경계를 걸치면 양쪽을 모두 포함한다 (빠지면 빈 칸이 생긴다)", () => {
    expect(chunksForRange(CHUNK_SIZE - 1, CHUNK_SIZE)).toEqual([0, 1]);
  });

  it("연속 구간을 빠짐없이 덮는다", () => {
    expect(chunksForRange(60, 149)).toEqual([2, 3, 4]);
  });

  it("구간을 바꿔도 청크 번호는 절대 좌표다", () => {
    // 6구간의 첫 항목은 offset을 CHUNK_SIZE로 나눈 청크에 들어갑니다
    const start = getOffset(6);
    expect(chunksForRange(start, start)).toEqual([start / CHUNK_SIZE]);
  });

  it("뒤집힌 범위는 빈 배열", () => {
    expect(chunksForRange(100, 50)).toEqual([]);
  });
});

describe("computeGridMetrics", () => {
  // 패딩은 zoom 바깥의 실제 px이므로 실제 px 공간에서 먼저 빼고 z로 나눕니다.
  // clientWidth / z - padding*2 로 쓰면 819.7이 나오는데 정답은 812.9입니다.
  // 585는 스크롤바(15px)를 뺀 clientWidth입니다. 스크롤바가 생기는 순간
  // 폭이 600→585로 줄어드는 게 실제로 겪는 상황입니다.
  it("뺄셈 순서를 지킨다 (clientWidth 585, 패딩 8, z 0.7)", () => {
    const { cols } = computeGridMetrics(585, 0.7, 8, 16, 200);
    const usableCorrect = (585 - 8 * 2) / 0.7; // 812.857…
    const usableWrong = 585 / 0.7 - 8 * 2; // 819.714…

    expect(usableCorrect).toBeCloseTo(812.857, 2);
    expect(usableWrong).toBeCloseTo(819.714, 2);
    // 6.9 단위 차이는 카드+gap 216의 3.2%라, 창 너비 분포의 약 3%에서
    // 열 수가 1 틀어집니다. 이 폭에서는 둘 다 3열이지만 값 자체가 달라집니다.
    expect(usableWrong - usableCorrect).toBeCloseTo(6.857, 2);
    expect(cols).toBe(Math.floor((usableCorrect + 16) / (200 + 16)));
  });

  it("행 높이는 카드 폭에서 확정된다 (border 1px × 2 보정 포함)", () => {
    const { cols, rowHUnit, rowHActual } = computeGridMetrics(
      1400,
      1,
      8,
      16,
      200,
    );
    const usable = 1400 - 16;
    const cardW = (usable - 16 * (cols - 1)) / cols;

    expect(rowHUnit).toBeCloseTo((cardW - 2) * (4 / 3) + 2 + 16, 6);
    // z=1이면 단위 공간과 실제 px이 같습니다
    expect(rowHActual).toBeCloseTo(rowHUnit, 6);
  });

  it("z가 걸리면 virtualizer에 넘기는 실제 높이가 z배가 된다", () => {
    const { rowHUnit, rowHActual } = computeGridMetrics(1400, 0.5, 8, 16, 200);
    expect(rowHActual).toBeCloseTo(rowHUnit * 0.5, 6);
  });

  it("폭이 아주 좁아도 최소 1열은 유지한다", () => {
    expect(computeGridMetrics(50, 1, 8, 16, 200).cols).toBe(1);
    expect(computeGridMetrics(0, 1, 8, 16, 200).cols).toBe(1);
  });
});

describe("computeListCols", () => {
  // 실제 호출 인자 (Downloader.vue): 패딩 8, gap 8, 최소 카드 폭 560
  const cols = (width: number, zoom = 1) =>
    computeListCols(width, zoom, 8, 8, 560);

  it("한 장도 못 담는 폭이면 1열", () => {
    expect(cols(900)).toBe(1);
  });

  it("두 장 + gap이 들어가는 순간 2열이 된다", () => {
    // 필요한 clientWidth = 560*2 + gap 8 + 패딩 16 = 1144
    expect(cols(1143)).toBe(1);
    expect(cols(1144)).toBe(2);
  });

  it("아무리 넓어도 상한을 넘지 않는다", () => {
    expect(cols(4000)).toBe(2);
    expect(computeListCols(4000, 1, 8, 8, 560, 3)).toBe(3);
  });

  // 그리드와 줌 처리가 반대입니다. 리스트에는 CSS zoom이 없고 썸네일 px에 z를
  // 직접 곱하므로, 폭을 z로 나누는 게 아니라 임계값에 z를 곱해야 합니다.
  it("줌을 키우면 카드가 커져 같은 폭에서 열이 줄어든다", () => {
    expect(cols(1200, 1)).toBe(2);
    expect(cols(1200, 1.5)).toBe(1); // 임계값 840 → 두 장이면 1688 필요
  });

  it("줌을 줄이면 더 좁은 폭에서도 2열이 된다", () => {
    expect(cols(900, 1)).toBe(1);
    expect(cols(900, 0.7)).toBe(2); // 임계값 392 → 두 장이면 800 필요
  });

  it("폭이 0이거나 줌이 비정상이어도 최소 1열은 유지한다", () => {
    expect(cols(0)).toBe(1);
    expect(computeListCols(1200, 0, 8, 8, 560)).toBe(2); // z<=0이면 1로 취급
  });
});

describe("visibleRange", () => {
  it("첫 구간 그리드에서 보이는 범위를 1-based로 준다", () => {
    expect(visibleRange({ startIndex: 0, endIndex: 4 }, 0, 6, PAGE)).toEqual({
      first: 1,
      last: 30,
    });
  });

  // offset을 빼먹으면 6구간에서도 1부터 시작해 값이 거짓이 됩니다.
  it("구간을 넘어가면 offset을 더해 절대 위치를 준다", () => {
    expect(visibleRange({ startIndex: 0, endIndex: 4 }, 5, 6, PAGE)).toEqual({
      first: getOffset(5) + 1,
      last: getOffset(5) + 30,
    });
  });

  it("리스트 뷰(cols=1)는 환산 없이 그대로", () => {
    expect(visibleRange({ startIndex: 10, endIndex: 13 }, 0, 1, PAGE)).toEqual({
      first: 11,
      last: 14,
    });
  });

  it("마지막 구간에서 shownCount를 넘지 않는다", () => {
    const last = getShownCount(TOTAL_ALL, LAST_PAGE_ALL);
    const rows = Math.ceil(last / 6);
    expect(
      visibleRange(
        { startIndex: rows - 1, endIndex: rows },
        LAST_PAGE_ALL,
        6,
        last,
      ),
    ).toEqual({
      first: getOffset(LAST_PAGE_ALL) + (rows - 1) * 6 + 1,
      last: TOTAL_ALL,
    });
  });

  it("범위가 없거나 결과가 비면 null", () => {
    expect(visibleRange(null, 0, 6, PAGE)).toBeNull();
    expect(visibleRange({ startIndex: 0, endIndex: 4 }, 0, 6, 0)).toBeNull();
  });
});

describe("shouldShowSkeleton", () => {
  it("검색 전에는 안내 문구를 보여야 하므로 스켈레톤을 안 띄운다", () => {
    expect(
      shouldShowSkeleton({
        searchStarted: false,
        isMetaLoading: true,
        total: 0,
        hasRendered: false,
      }),
    ).toBe(false);
  });

  it("총 건수를 받기 전에는 띄운다", () => {
    expect(
      shouldShowSkeleton({
        searchStarted: true,
        isMetaLoading: true,
        total: 0,
        hasRendered: false,
      }),
    ).toBe(true);
  });

  it("총 건수는 왔지만 첫 청크가 아직이면 띄운다", () => {
    expect(
      shouldShowSkeleton({
        searchStarted: true,
        isMetaLoading: false,
        total: TOTAL_KOREAN,
        hasRendered: false,
      }),
    ).toBe(true);
  });

  /**
   * "N번째로 이동"이 첫 시도에 1번으로 튕기던 회귀.
   *
   * 점프하면 보이던 청크가 활성 목록에서 빠지고 목표 청크는 아직 안 와서
   * 로드된 항목이 0이 됩니다. 이걸 로딩으로 치면 스페이서가 통째로 스켈레톤과
   * 교체되고, 스크롤러 높이가 무너지며 브라우저가 scrollTop을 0으로 클램프합니다.
   */
  it("목록이 한 번 그려진 뒤에는 보이는 청크가 비어도 안 띄운다", () => {
    expect(
      shouldShowSkeleton({
        searchStarted: true,
        isMetaLoading: false,
        total: TOTAL_KOREAN,
        hasRendered: true,
      }),
    ).toBe(false);
  });

  it("결과 0건은 스켈레톤이 아니라 빈 상태로 넘긴다", () => {
    expect(
      shouldShowSkeleton({
        searchStarted: true,
        isMetaLoading: false,
        total: 0,
        hasRendered: false,
      }),
    ).toBe(false);
  });
});
