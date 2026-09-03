export interface RatingStats {
  /** 평가한 책만의 평균. 미평가를 섞으면 라이브러리가 클수록 0에 붙어 의미가 없어진다 */
  average: number;
  ratedCount: number;
  /** 0(미평가)~5 여섯 칸을 항상 채운다. 빈 칸이 있으면 차트에 구멍이 난다 */
  distribution: { rating: number; count: number }[];
}

/**
 * `GROUP BY rating` 결과를 통계 화면이 쓰는 모양으로 바꾼다.
 *
 * 순수 함수라 statisticsHandler와 따로 둔다. 핸들러는 electron·fs·db를 물고
 * 있어서 테스트가 임포트하는 순간 그 모킹까지 전부 딸려 온다.
 */
export const summarizeRatings = (
  rows: { rating: number; count: number }[],
): RatingStats => {
  const counts = new Map<number, number>();
  for (let rating = 0; rating <= 5; rating++) counts.set(rating, 0);

  for (const row of rows) {
    const rating = Number(row.rating);
    if (!counts.has(rating)) continue;
    counts.set(rating, counts.get(rating)! + Number(row.count));
  }

  let ratedCount = 0;
  let ratedSum = 0;
  for (const [rating, count] of counts) {
    if (rating === 0) continue;
    ratedCount += count;
    ratedSum += rating * count;
  }

  return {
    average:
      ratedCount === 0 ? 0 : Math.round((ratedSum / ratedCount) * 100) / 100,
    ratedCount,
    distribution: [...counts].map(([rating, count]) => ({ rating, count })),
  };
};
