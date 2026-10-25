/**
 * 이 화면이 파일을 가진 PC의 Electron 창이 아니라 웹 서버로 접속한 브라우저인지.
 * 기기 종류(폰/PC)와는 상관없다. Electron 창은 nodeIntegration으로 `window.require`가 있다.
 */
export const IS_REMOTE: boolean =
  typeof window !== "undefined" &&
  typeof (window as { require?: unknown }).require !== "function";
