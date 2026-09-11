import { describe, expect, it } from "vitest";
import {
  chunksForRange,
  computeCols,
  computeListCols,
  measuredRowHeight,
  shouldShowSkeleton,
} from "../../../src/renderer/lib/virtualList";

/** 다운로더의 청크 크기 (히토미 검색 API 페이지 크기) */
const CHUNK_SIZE = 30;
/** 라이브러리의 청크 크기 (기존 get-books pageSize) */
const LIB_CHUNK = 50;
/** 한국어 검색의 실측 총 건수 (2026-08-11) */
const TOTAL_KOREAN = 98_640;

describe("chunksForRange", () => {
  it("한 청크 안에 들어가면 하나만 반환한다", () => {
    expect(chunksForRange(0, CHUNK_SIZE - 1, CHUNK_SIZE)).toEqual([0]);
  });

  it("경계를 걸치면 양쪽을 모두 포함한다 (빠지면 빈 칸이 생긴다)", () => {
    expect(chunksForRange(CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE)).toEqual([
      0, 1,
    ]);
  });

  it("연속 구간을 빠짐없이 덮는다", () => {
    expect(chunksForRange(60, 149, CHUNK_SIZE)).toEqual([2, 3, 4]);
  });

  it("구간을 바꿔도 청크 번호는 절대 좌표다", () => {
    // 6구간(PAGE=5000)의 첫 항목은 offset을 청크 크기로 나눈 청크에 들어갑니다
    const start = 5000 * 6;
    expect(chunksForRange(start, start, CHUNK_SIZE)).toEqual([
      start / CHUNK_SIZE,
    ]);
  });

  it("뒤집힌 범위는 빈 배열", () => {
    expect(chunksForRange(100, 50, CHUNK_SIZE)).toEqual([]);
  });

  // 라이브러리는 50, 다운로더는 30을 쓴다. 크기가 인자여야 하는 이유다.
  it("청크 크기가 다르면 같은 범위가 다른 청크로 나뉜다", () => {
    expect(chunksForRange(0, 99, LIB_CHUNK)).toEqual([0, 1]);
    expect(chunksForRange(0, 99, CHUNK_SIZE)).toEqual([0, 1, 2, 3]);
  });

  it("라이브러리 청크 크기 경계", () => {
    expect(chunksForRange(49, 50, LIB_CHUNK)).toEqual([0, 1]);
    expect(chunksForRange(50, 99, LIB_CHUNK)).toEqual([1]);
  });
});

describe("computeCols", () => {
  // 패딩은 zoom 바깥의 실제 px이므로 실제 px 공간에서 먼저 빼고 z로 나눕니다.
  // clientWidth / z - padding*2 로 쓰면 819.7이 나오는데 정답은 812.9입니다.
  it("뺄셈 순서를 지킨다 (clientWidth 585, 패딩 8, z 0.7)", () => {
    const usableCorrect = (585 - 8 * 2) / 0.7; // 812.857…
    const usableWrong = 585 / 0.7 - 8 * 2; // 819.714…

    expect(usableWrong - usableCorrect).toBeCloseTo(6.857, 2);
    expect(computeCols(585, 0.7, 8, 16, 200)).toBe(
      Math.floor((usableCorrect + 16) / (200 + 16)),
    );
  });

  it("폭이 아주 좁아도 최소 1열은 유지한다", () => {
    expect(computeCols(50, 1, 8, 16, 200)).toBe(1);
    expect(computeCols(0, 1, 8, 16, 200)).toBe(1);
  });

  it("폭이 넓어지면 열이 늘어난다", () => {
    expect(computeCols(1400, 1, 8, 12, 184)).toBeGreaterThan(
      computeCols(600, 1, 8, 12, 184),
    );
  });

  // 라이브러리 그리드의 실제 인자 (패딩 0, gap 12, minmax 184px)
  it("라이브러리 그리드 인자에서 열 수가 나온다", () => {
    expect(computeCols(1400, 0.9, 0, 12, 184)).toBe(
      Math.floor((1400 / 0.9 + 12) / (184 + 12)),
    );
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

describe("measuredRowHeight", () => {
  /** 리스트 행의 실측 높이 (줌 40%, 2열) */
  const ROW_HEIGHT = 122;
  /** 같은 조건의 추정 높이 */
  const ESTIMATE = 119.6;

  const rowOf = (height: number) => ({
    getBoundingClientRect: () => ({ height }),
  });

  it("ResizeObserver가 준 blockSize를 우선 쓴다", () => {
    expect(
      measuredRowHeight(
        rowOf(0),
        { borderBoxSize: [{ blockSize: ROW_HEIGHT }] },
        ESTIMATE,
      ),
    ).toBe(ROW_HEIGHT);
  });

  it("entry가 없으면 엘리먼트를 직접 잰다", () => {
    expect(measuredRowHeight(rowOf(ROW_HEIGHT), undefined, ESTIMATE)).toBe(
      ROW_HEIGHT,
    );
  });

  /**
   * 새로고침하면 목록이 맨 위가 아닌 곳에서 시작하던 회귀.
   *
   * 스페이서가 문서에 붙기 전에 마운트된 행은 높이가 0으로 잡히는데, 그 0을
   * 캐시하면 진짜 높이가 들어올 때 가상 스크롤러가 그 차이만큼 스크롤을 내린다.
   */
  it("문서에서 떨어져 높이가 0이면 추정으로 되돌린다", () => {
    expect(measuredRowHeight(rowOf(0), undefined, ESTIMATE)).toBe(ESTIMATE);
    expect(
      measuredRowHeight(rowOf(0), { borderBoxSize: [{ blockSize: 0 }] }, 300),
    ).toBe(300);
  });
});
