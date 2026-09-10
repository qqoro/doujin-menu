import type { Tag } from "node-hitomi";
import { hitomi } from "./client.js";

/**
 * 태그 이름 규칙입니다.
 *
 * 라이브러리는 이름을 검사하지 않습니다. language와 type만 알려진 값인지 보고,
 * 나머지는 대문자든 한글이든 그대로 통과시킨 뒤 nozomi 파일을 요청합니다.
 * 그래서 잘못된 이름은 "404가 돌아왔다"는 형태로 뒤늦게 드러납니다.
 *
 * 구독 등록처럼 "지금 이 검색어가 쓸 수 있는 것인가"를 즉시 답해야 하는 곳이
 * 있어서 검사를 여기서 들고 있습니다.
 */
const TAG_NAME_PATTERN = /^[a-z0-9][a-z0-9-_.]*$/;

/**
 * 태그 표현식을 파싱합니다. 콜론이 없는 낱말(제목 검색어)은 그냥 빠집니다.
 *
 * 이름이 규칙에 맞지 않으면 던집니다. 호출부는 이 예외를 잡아 유저에게
 * 보여주거나 해당 항목만 건너뜁니다.
 */
export const parseTags = (expression: string): Tag[] => {
  for (const token of expression.trim().split(/\s+/).filter(Boolean)) {
    const colonIndex = token.indexOf(":");
    if (colonIndex === -1) continue;

    const name = token.slice(colonIndex + 1);
    if (!TAG_NAME_PATTERN.test(name)) {
      throw new Error(
        `태그 이름에는 소문자와 숫자, -_. 만 쓸 수 있습니다: ${name}`,
      );
    }
  }

  return hitomi.tags.parse(expression);
};

/**
 * 부호를 뗀 같은 태그를 만듭니다.
 *
 * 태그 하나의 ID 목록을 받을 때 반드시 필요합니다. 음성 태그를 그대로
 * galleries.list에 넘기면 출발점이 될 태그가 없는 것으로 보고 전체 인덱스
 * 120만건을 받아 차집합을 냅니다. 결과도 원하는 것과 다릅니다.
 */
export const toPositiveTag = (tag: Tag): Tag =>
  tag.isNegative ? hitomi.tags.create(tag.type, tag.name) : tag;

/** 태그 배열에서 이름만 뽑습니다 */
export const toNames = (tags: readonly Tag[]): string[] =>
  tags.map((tag) => tag.name);

/**
 * 태그 조회 제한 시간입니다.
 *
 * 라이브러리는 요청에 시간 제한을 두지 않습니다. 구독 폴링은 사이클 하나를
 * 재진입 잠금으로 감싸고 도는데, 응답 없는 요청 하나가 매달리면 잠금이 풀리지
 * 않아 이후 자동 폴링과 수동 새로고침이 전부 멈춥니다.
 */
const TAG_FETCH_TIMEOUT = 30_000;

const withTimeout = <T>(
  promise: Promise<T>,
  timeout: number,
  message: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
};

/** 태그 하나에 해당하는 갤러리 ID 전체를 받습니다. 최신순(ID 내림차순)입니다 */
export const fetchTagIds = async (tag: Tag): Promise<number[]> => {
  const references = await withTimeout(
    hitomi.galleries.list({ tags: [toPositiveTag(tag)] }),
    TAG_FETCH_TIMEOUT,
    `태그 조회 시간 초과: ${tag.type}:${tag.name}`,
  );

  return references.map((reference) => reference.id);
};
