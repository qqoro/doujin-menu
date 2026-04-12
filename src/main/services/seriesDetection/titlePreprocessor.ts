/**
 * 제목 전처리기
 * 시리즈 패턴 매칭 전에 제목을 정규화하여 정확도를 높임
 */

// 전각 숫자/영문 → 반각 매핑
const FULLWIDTH_DIGITS: Record<string, string> = {
  "０": "0",
  "１": "1",
  "２": "2",
  "３": "3",
  "４": "4",
  "５": "5",
  "６": "6",
  "７": "7",
  "８": "8",
  "９": "9",
};

// 전각 기호 → 반각 매핑
const FULLWIDTH_SYMBOLS: Record<string, string> = {
  "（": "(",
  "）": ")",
  "［": "[",
  "］": "]",
  "｛": "{",
  "｝": "}",
  "：": ":",
  "；": ";",
  "，": ",",
  "．": ".",
  "！": "!",
  "？": "?",
  "＋": "+",
  "－": "-",
  "＝": "=",
  "＠": "@",
  "＃": "#",
  "＄": "$",
  "％": "%",
  "＆": "&",
  "＊": "*",
  "／": "/",
  "＼": "\\",
  "｜": "|",
  "～": "~",
  "　": " ", // 전각 공백
};

// 장식 문자 정규식 (제거할 특수기호들)
const DECORATIVE_CHARS_REGEX = /[★♡☆♪♦♠♣♥●○◎◇◆□■△▽▲▼✦✧⚡✨✿❀❁❷❸❹❺♡♥☆★♪♫♩♬♪]/g;

/**
 * 제목을 전처리하여 패턴 매칭 정확도를 높임
 * 원본 제목은 수정하지 않고 정규화된 문자열을 반환
 */
export function preprocessTitle(title: string): string {
  let result = title;

  // 1. 전각 문자 → 반각 변환
  result = convertFullwidthToHalfwidth(result);

  // 2. 장식 문자 제거
  result = result.replace(DECORATIVE_CHARS_REGEX, "");

  // 3. 물결표(~) 정리: "제목~~" → "제목"
  result = result.replace(/~{2,}/g, " ");

  // 4. 연속 공백 정리
  result = result.replace(/\s+/g, " ");

  // 5. 앞뒤 공백 제거
  result = result.trim();

  return result;
}

/**
 * 전각 문자를 반각 문자로 변환
 */
function convertFullwidthToHalfwidth(text: string): string {
  let result = "";

  for (const char of text) {
    // 전각 숫자 변환
    if (FULLWIDTH_DIGITS[char]) {
      result += FULLWIDTH_DIGITS[char];
    }
    // 전각 기호 변환
    else if (FULLWIDTH_SYMBOLS[char]) {
      result += FULLWIDTH_SYMBOLS[char];
    }
    // 전각 영문 (A-Z, a-z) 변환: U+FF01 ~ U+FF5E
    else {
      const code = char.charCodeAt(0);
      if (code >= 0xff21 && code <= 0xff3a) {
        // 전각 대문자 A-Z
        result += String.fromCharCode(code - 0xfee0);
      } else if (code >= 0xff41 && code <= 0xff5a) {
        // 전각 소문자 a-z
        result += String.fromCharCode(code - 0xfee0);
      } else {
        result += char;
      }
    }
  }

  return result;
}
