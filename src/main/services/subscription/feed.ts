/**
 * 구독 결과를 다루는 순수 함수들. 네트워크도 DB도 모른다.
 *
 * 통합 피드는 ID 내림차순으로 정렬한다. 히토미 갤러리 ID는 증가하므로
 * 이 정렬이 곧 최신순이고, 덕분에 nozomi 파일의 순서를 신뢰할 필요가 없다.
 */

/**
 * 양성 태그 집합들의 교집합을 내고 음성 집합을 뺀다.
 *
 * 첫 집합의 순서를 유지한다. 결과가 결정적이어야 디버깅이 쉽다
 * (피드는 어차피 buildFeed에서 다시 정렬된다).
 */
export const intersect = (sets: number[][], exclude: number[][]): number[] => {
  const [seed, ...rest] = sets;
  if (!seed) return [];

  let result = seed;

  for (const set of rest) {
    const lookup = new Set(set);
    result = result.filter((id) => lookup.has(id));
    if (result.length === 0) return [];
  }

  for (const set of exclude) {
    if (set.length === 0) continue;
    const lookup = new Set(set);
    result = result.filter((id) => !lookup.has(id));
  }

  return result;
};

/**
 * 최대 ID. 빈 배열이면 null이다.
 *
 * 반드시 루프로 구한다. Math.max(...ids)는 V8 인자 상한(약 10만)에 걸려
 * RangeError를 던지는데, language:korean 하나가 실측 98,935건이라 실제로 밟는다.
 */
export const maxId = (ids: number[]): number | null => {
  if (ids.length === 0) return null;

  let max = ids[0];
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] > max) max = ids[i];
  }
  return max;
};

/**
 * 워터마크를 넘는 건수.
 *
 * lastSeenId가 null이면 기준선이 아직 없다는 뜻이라 0을 돌려준다.
 * (첫 폴링은 기준선만 잡고 신작으로 치지 않는다)
 */
export const countNew = (ids: number[], lastSeenId: number | null): number => {
  if (lastSeenId === null) return 0;

  let count = 0;
  for (const id of ids) {
    if (id > lastSeenId) count++;
  }
  return count;
};

/**
 * 구독별 ID 배열을 하나의 피드로 합친다.
 * 합집합 → 중복 제거 → ID 내림차순.
 *
 * 한 작품이 여러 구독에 걸릴 수 있어 중복 제거가 필요하다.
 * Int32Array로 두는 건 메모리 때문이다 (건당 8바이트 → 4바이트).
 */
export const buildFeed = (perSubscriptionIds: number[][]): Int32Array => {
  const union = new Set<number>();
  for (const ids of perSubscriptionIds) {
    for (const id of ids) union.add(id);
  }

  const feed = Int32Array.from(union);
  feed.sort();
  return feed.reverse();
};
