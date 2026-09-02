/** 책 하나의 표지 해시 */
export interface CoverHashItem {
  id: number;
  hash: string;
}

/**
 * 이 값 미만의 정보량을 가진 해시는 그룹핑에서 뺀다.
 *
 * dHash는 가로 이웃 픽셀의 대소만 보므로 완전한 백지 표지는 해시가 0으로
 * 깔리고, 서로 무관한 책들이 한 덩어리가 된다. 실제 라이브러리 3406권의
 * 최저 정보량이 10비트였고 12비트짜리가 진짜 중복을 냈으므로, 이 값을
 * 더 올리면 잡아야 할 것을 잃는다.
 */
export const MIN_INFORMATION_BITS = 6;

export const DEFAULT_HAMMING_THRESHOLD = 4;

const HASH_BITS = 64;
const HASH_BYTES = HASH_BITS / 8;

const POPCOUNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  POPCOUNT_TABLE[i] = (i & 1) + POPCOUNT_TABLE[i >> 1];
}

export const hexToBytes = (hex: string): Uint8Array | null => {
  if (!/^[0-9a-f]{16}$/i.test(hex)) return null;

  const bytes = new Uint8Array(HASH_BYTES);
  for (let i = 0; i < HASH_BYTES; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

export const popcount = (bytes: Uint8Array): number => {
  let count = 0;
  for (let i = 0; i < bytes.length; i++) count += POPCOUNT_TABLE[bytes[i]];
  return count;
};

export const hammingDistance = (a: Uint8Array, b: Uint8Array): number => {
  let distance = 0;
  for (let i = 0; i < HASH_BYTES; i++) distance += POPCOUNT_TABLE[a[i] ^ b[i]];
  return distance;
};

/** 64비트를 조각 수만큼 고르게 나눈 [시작, 끝) 구간들 */
const chunkRanges = (count: number): [number, number][] =>
  Array.from({ length: count }, (_, i) => [
    Math.floor((i * HASH_BITS) / count),
    Math.floor(((i + 1) * HASH_BITS) / count),
  ]);

/** [from, to) 구간의 비트를 정수 키로 뽑는다. 조각이 16비트 이하라 number로 충분하다 */
const sliceBits = (bytes: Uint8Array, from: number, to: number): number => {
  let value = 0;
  for (let bit = from; bit < to; bit++) {
    value = (value << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
  }
  return value;
};

/**
 * 해밍 거리가 threshold 이하인 해시끼리 묶는다.
 *
 * 전량 쌍 비교는 5만 권에서 12.5억 쌍이라 쓸 수 없다(실측 48.9초). 대신
 * 해시를 threshold+1 조각으로 쪼개 조각별 인덱스를 만든다. 틀린 비트가
 * threshold개뿐이면 조각을 전부 오염시킬 수 없으므로, 거리가 threshold
 * 이하인 두 해시는 최소 한 조각이 반드시 완전히 일치한다(비둘기집 원리).
 * 근사가 아니라 정확하다 — 후보를 좁힐 뿐이고 실제 거리로 다시 검증한다.
 */
export const groupByHamming = (
  items: CoverHashItem[],
  threshold: number = DEFAULT_HAMMING_THRESHOLD,
): number[][] => {
  const parsed: { id: number; bytes: Uint8Array }[] = [];
  for (const item of items) {
    const bytes = hexToBytes(item.hash);
    if (!bytes) continue;
    if (popcount(bytes) < MIN_INFORMATION_BITS) continue;
    parsed.push({ id: item.id, bytes });
  }

  const ranges = chunkRanges(threshold + 1);
  const indexes = ranges.map(() => new Map<number, number[]>());
  parsed.forEach((item, index) => {
    ranges.forEach(([from, to], chunk) => {
      const key = sliceBits(item.bytes, from, to);
      const bucket = indexes[chunk].get(key);
      if (bucket) bucket.push(index);
      else indexes[chunk].set(key, [index]);
    });
  });

  const parent = parsed.map((_, index) => index);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const join = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  };

  parsed.forEach((item, index) => {
    const candidates = new Set<number>();
    ranges.forEach(([from, to], chunk) => {
      const bucket = indexes[chunk].get(sliceBits(item.bytes, from, to));
      if (!bucket) return;
      for (const other of bucket) if (other > index) candidates.add(other);
    });

    for (const other of candidates) {
      if (hammingDistance(item.bytes, parsed[other].bytes) <= threshold) {
        join(index, other);
      }
    }
  });

  const groups = new Map<number, number[]>();
  parsed.forEach((item, index) => {
    const root = find(index);
    const bucket = groups.get(root);
    if (bucket) bucket.push(item.id);
    else groups.set(root, [item.id]);
  });

  return [...groups.values()].filter((ids) => ids.length > 1);
};
