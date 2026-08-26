import { ref } from "vue";
import { ipcRenderer } from "../api";
import type { ColorTheme } from "../types/themes";

// 현재 적용된 테마
const currentTheme = ref<ColorTheme>("cosmic-night");

// 테마 CSS 파일을 동적으로 로드하는 함수
const loadThemeCSS = (theme: ColorTheme) => {
  // 기존 테마 CSS 제거
  const existingThemeLink = document.getElementById(
    "theme-css",
  ) as HTMLLinkElement;
  if (existingThemeLink) {
    existingThemeLink.remove();
  }

  // 새로운 테마 CSS 추가
  const link = document.createElement("link");
  link.id = "theme-css";
  link.rel = "stylesheet";
  // 개발(http/https)/프로덕션(file) 환경에 따라 경로 설정
  const baseHref =
    window.location.protocol === "file:"
      ? window.location.pathname.replace(/index\.html$/, "")
      : "/";
  link.href = `${baseHref}assets/themes/${theme}.css`;
  document.head.appendChild(link);
};

export const useTheme = () => {
  // 테마 초기화 함수
  const initializeTheme = async () => {
    try {
      const config = await ipcRenderer.invoke("get-config");
      const savedTheme = (config.colorTheme as ColorTheme) || "cosmic-night";
      currentTheme.value = savedTheme;
      loadThemeCSS(savedTheme);
    } catch (error) {
      console.error("테마 초기화 실패:", error);
      // 기본 테마 적용
      loadThemeCSS("cosmic-night");
    }
  };

  // 테마 변경 함수
  const setTheme = async (theme: ColorTheme) => {
    try {
      currentTheme.value = theme;
      loadThemeCSS(theme);

      // 설정에 저장
      await ipcRenderer.invoke("set-config", {
        key: "colorTheme",
        value: theme,
      });
    } catch (error) {
      console.error("테마 변경 실패:", error);
    }
  };

  return {
    currentTheme,
    initializeTheme,
    setTheme,
  };
};
