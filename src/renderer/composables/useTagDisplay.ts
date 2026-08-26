// 태그 표시 정보를 반환하는 컴포저블

/**
 * 배지를 얹는 바탕.
 *
 * `card`는 카드 배경 위(리스트 뷰), `scrim`은 표지 위 어두운 그라디언트
 * 위(그리드 뷰)다. 같은 불투명 색을 표지 위에 얹으면 칩이 표지를 가리는 판처럼
 * 보여서, 색조만 남기고 반투명으로 깐다.
 */
type TagSurface = "card" | "scrim";

const CARD_TONE = {
  female:
    " bg-pink-100 text-pink-800 dark:bg-pink-800 dark:text-pink-100 hover:bg-pink-200 dark:hover:bg-pink-700",
  male: " bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700",
  other:
    " bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700",
};

const SCRIM_TONE = {
  female: " bg-pink-400/45 text-pink-50 hover:bg-pink-400/65",
  male: " bg-sky-400/45 text-sky-50 hover:bg-sky-400/65",
  other: " bg-white/25 text-white hover:bg-white/40",
};

export function useTagDisplay() {
  const getTagDisplayInfo = (
    tag: { name: string },
    surface: TagSurface = "card",
  ) => {
    let className = "text-xs px-1.5 py-0.5 rounded-full cursor-pointer";
    let displayText = tag.name;
    const tone = surface === "scrim" ? SCRIM_TONE : CARD_TONE;

    if (tag.name.startsWith("female:")) {
      className += tone.female;
      displayText = tag.name.substring("female:".length);
    } else if (tag.name.startsWith("male:")) {
      className += tone.male;
      displayText = tag.name.substring("male:".length);
    } else {
      className += tone.other;
    }

    return { className, displayText };
  };

  return {
    getTagDisplayInfo,
  };
}
