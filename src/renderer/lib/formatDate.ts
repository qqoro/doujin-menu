/**
 * 날짜를 한국어 형식(YYYY.MM.DD)으로 포맷합니다.
 * @param date - Date 객체, 날짜 문자열, 또는 타임스탬프
 * @returns 포맷된 날짜 문자열 (예: "2024.01.15") 또는 빈 문자열
 */
export function formatPublishDate(
  date: Date | string | number | undefined | null,
): string {
  if (!date) return "";

  const d = date instanceof Date ? date : new Date(date);

  // 유효하지 않은 날짜인 경우 (NaN 체크)
  if (isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}
