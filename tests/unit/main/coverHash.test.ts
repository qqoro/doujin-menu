import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAMMING_THRESHOLD,
  groupByHamming,
  hammingDistance,
  hexToBytes,
  popcount,
  type CoverHashItem,
} from "../../../src/main/services/duplicateDetection/coverHash";

/** 테스트에서만 쓰는 정직한 전량 비교. 비둘기집 결과를 여기에 대조한다 */
const bruteForceGroups = (
  items: CoverHashItem[],
  threshold: number,
): number[][] => {
  const parsed = items
    .map((item) => ({ id: item.id, bytes: hexToBytes(item.hash)! }))
    .filter((item) => item.bytes && popcount(item.bytes) >= 6);

  const parent = parsed.map((_, index) => index);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      if (hammingDistance(parsed[i].bytes, parsed[j].bytes) <= threshold) {
        parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  parsed.forEach((item, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), item.id]);
  });
  return [...groups.values()].filter((ids) => ids.length > 1);
};

/** 그룹 집합을 순서에 무관하게 비교할 수 있는 형태로 */
const canonical = (groups: number[][]) =>
  groups
    .map((ids) => [...ids].sort((a, b) => a - b).join(","))
    .sort()
    .join(" | ");

describe("coverHash/hexToBytes", () => {
  it("16자리 16진수를 8바이트로 바꾼다", () => {
    expect(Array.from(hexToBytes("00ff10ab00000000")!)).toEqual([
      0, 255, 16, 171, 0, 0, 0, 0,
    ]);
  });

  it("길이나 형식이 틀리면 null을 돌려준다", () => {
    expect(hexToBytes("")).toBeNull();
    expect(hexToBytes("abc")).toBeNull();
    expect(hexToBytes("zzzzzzzzzzzzzzzz")).toBeNull();
    expect(hexToBytes("00ff10ab000000000")).toBeNull();
  });
});

describe("coverHash/popcount, hammingDistance", () => {
  it("1비트 개수를 센다", () => {
    expect(popcount(hexToBytes("0000000000000000")!)).toBe(0);
    expect(popcount(hexToBytes("ffffffffffffffff")!)).toBe(64);
    expect(popcount(hexToBytes("0000000000000001")!)).toBe(1);
  });

  it("서로 다른 비트 수를 센다", () => {
    const a = hexToBytes("0000000000000000")!;
    expect(hammingDistance(a, a)).toBe(0);
    expect(hammingDistance(a, hexToBytes("0000000000000003")!)).toBe(2);
    expect(hammingDistance(a, hexToBytes("ffffffffffffffff")!)).toBe(64);
  });
});

describe("coverHash/groupByHamming", () => {
  it("거리가 임계값 이하인 해시를 묶는다", () => {
    const groups = groupByHamming([
      { id: 1, hash: "0f0f0f0f0f0f0f0f" },
      { id: 2, hash: "0f0f0f0f0f0f0f0e" },
    ]);
    expect(canonical(groups)).toBe("1,2");
  });

  it("임계값 경계에서 정확히 갈린다", () => {
    // 마지막 바이트에서 4비트 차이 (0x0f vs 0x00)
    const atThreshold = groupByHamming([
      { id: 1, hash: "0f0f0f0f0f0f0f0f" },
      { id: 2, hash: "0f0f0f0f0f0f0f00" },
    ]);
    expect(canonical(atThreshold)).toBe("1,2");

    // 5비트 차이는 묶이지 않는다
    const overThreshold = groupByHamming([
      { id: 1, hash: "0f0f0f0f0f0f0f1f" },
      { id: 2, hash: "0f0f0f0f0f0f0f00" },
    ]);
    expect(overThreshold).toEqual([]);
  });

  it("정보량이 6비트 미만인 해시는 아예 제외한다", () => {
    // 백지 표지끼리 서로 묶이는 오탐을 막는다
    const groups = groupByHamming([
      { id: 1, hash: "0000000000000001" },
      { id: 2, hash: "0000000000000003" },
    ]);
    expect(groups).toEqual([]);
  });

  it("6비트 이상이면 살아남는다 (실측에서 12비트가 정탐을 냈다)", () => {
    const groups = groupByHamming([
      { id: 1, hash: "88d0208220100820" },
      { id: 2, hash: "88d0208220100821" },
    ]);
    expect(canonical(groups)).toBe("1,2");
  });

  it("형식이 잘못된 해시는 조용히 건너뛴다", () => {
    const groups = groupByHamming([
      { id: 1, hash: "not-a-hash" },
      { id: 2, hash: "0f0f0f0f0f0f0f0f" },
    ]);
    expect(groups).toEqual([]);
  });

  it("이어진 관계는 한 그룹으로 합친다", () => {
    // 1-2가 가깝고 2-3이 가까우면 1-3이 멀어도 한 그룹이다
    const groups = groupByHamming([
      { id: 1, hash: "0f0f0f0f0f0f0f00" },
      { id: 2, hash: "0f0f0f0f0f0f0f0f" },
      { id: 3, hash: "0f0f0f0f0f0f0fff" },
    ]);
    expect(canonical(groups)).toBe("1,2,3");
  });

  it("비둘기집 버킷팅이 전량 비교와 완전히 같은 결과를 낸다", () => {
    // 이게 깨지면 에러 없이 조용히 중복을 놓친다. 이 파일에서 가장 중요한 테스트다.
    let seed = 12345;
    const random = () => {
      // 재현 가능한 난수 (xorshift)
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0xffffffff;
    };

    const items: CoverHashItem[] = [];
    for (let i = 0; i < 2000; i++) {
      // 절반은 완전 난수, 절반은 앞선 해시를 조금 비튼 값이라 실제로 묶인다
      if (i % 2 === 0 || items.length === 0) {
        let hex = "";
        for (let b = 0; b < 8; b++)
          hex += Math.floor(random() * 256)
            .toString(16)
            .padStart(2, "0");
        items.push({ id: i + 1, hash: hex });
      } else {
        const base = hexToBytes(items[items.length - 1].hash)!;
        const mutated = Uint8Array.from(base);
        const flips = Math.floor(random() * 7);
        for (let f = 0; f < flips; f++) {
          const bit = Math.floor(random() * 64);
          mutated[bit >> 3] ^= 1 << (7 - (bit & 7));
        }
        items.push({
          id: i + 1,
          hash: Array.from(mutated)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        });
      }
    }

    for (const threshold of [0, 2, 4, 6]) {
      expect(canonical(groupByHamming(items, threshold))).toBe(
        canonical(bruteForceGroups(items, threshold)),
      );
    }
  });

  it("기본 임계값은 4다", () => {
    expect(DEFAULT_HAMMING_THRESHOLD).toBe(4);
  });
});
