// 태그 표시 정보를 반환하는 컴포저블
export function useTagDisplay() {
  const getTagDisplayInfo = (tag: { name: string }) => {
    let className = "text-xs px-1.5 py-0.5 rounded-full cursor-pointer";
    let displayText = tag.name;

    if (tag.name.startsWith("female:")) {
      className +=
        " bg-pink-100 text-pink-800 dark:bg-pink-800 dark:text-pink-100 hover:bg-pink-200 dark:hover:bg-pink-700";
      displayText = tag.name.substring("female:".length);
    } else if (tag.name.startsWith("male:")) {
      className +=
        " bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700";
      displayText = tag.name.substring("male:".length);
    } else {
      className +=
        " bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700";
    }

    return { className, displayText };
  };

  return {
    getTagDisplayInfo,
  };
}
