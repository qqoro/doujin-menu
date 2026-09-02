import { preprocessTitle } from "../seriesDetection/titlePreprocessor.js";

/**
 * 괄호 묶음 하나. 여는 괄호 다음부터 닫는 괄호 직전까지를 내용으로 잡는다.
 * 중첩 괄호는 안쪽 기준으로 끊기지만, 어차피 통째로 지우는 쪽이라 결과는 같다.
 */
const BRACKET_GROUP = /[[({<【（]([^\]})>】）]*)[\]})>】）]/g;

/**
 * 괄호 안이 "몇 번째"를 가리키는지 판별한다.
 *
 * 이 판별이 중복 탐지의 오탐/미탐을 가른다. `(decensored)`나 `[Korean]`처럼
 * 같은 작품에 붙었다 말았다 하는 꼬리표는 지워야 묶이고, `(2)`·`(Jou)`처럼
 * 권차를 가리키는 것은 남겨야 다른 권이 한 그룹으로 뭉치지 않는다.
 *
 * 숫자만 어디에 있든 권차로 치고, 글자 표기는 괄호 내용 전체가 그 표기일
 * 때만 인정한다. 글자가 들어 있기만 하면 통과시키면 `(하렘)`·`(전연령)`
 * 같은 평범한 꼬리표가 권차로 오인돼 같은 작품이 갈라진다.
 */
const ORDER_MARK =
  /[0-9]|^\s*(?:[상중하전후上中下前後](?:권|화|편)?|(?:jou|ge|chuu|zen|kou)(?:kan)?|vol\.?|part|ch)\s*$/i;

/** 문자와 숫자만 남긴다. 공백·구두점·이모지가 전부 걷힌다 */
const stripToAlphanumeric = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * 중복 판별용 제목 키를 만든다.
 *
 * 표기만 다른 같은 작품을 한 키로 모으는 게 목적이라 원본 제목은 건드리지
 * 않는다. 키가 빈 문자열이면 비교할 알맹이가 없다는 뜻이므로, 호출부는
 * 그런 책을 그룹핑에서 빼야 한다. 괄호를 걷어내면 이모지만 남는 제목끼리
 * 서로 묶여버리는 오탐이 이 규칙으로 막힌다.
 */
export const normalizeTitleKey = (title: string): string => {
  const withoutNoise = preprocessTitle(title).replace(
    BRACKET_GROUP,
    (_match, inner: string) => (ORDER_MARK.test(inner) ? ` ${inner} ` : " "),
  );

  return stripToAlphanumeric(withoutNoise);
};
