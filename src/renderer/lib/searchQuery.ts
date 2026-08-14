/**
 * 검색어 문자열에서 항목 하나를 켜고 끈다.
 *
 * 라이브러리의 태그·작가·그룹·시리즈·캐릭터 칩 클릭이 전부 같은 동작이다.
 * `Library.vue`가 각 종류마다 같은 7줄을 복사해 들고 있었다.
 *
 * **부분 문자열이 아니라 공백으로 끊은 토큰 단위로 비교한다.** `includes`로
 * 지우면 `tag:nurse`가 있는 상태에서 `tag:nurse2`를 누를 때 엉뚱한 쪽이 지워진다.
 */
export const toggleSearchTerm = (query: string, term: string): string => {
  const terms = query.split(" ").filter((s) => s !== "");
  const index = terms.indexOf(term);

  if (index > -1) {
    terms.splice(index, 1);
  } else {
    terms.push(term);
  }

  return terms.join(" ");
};
