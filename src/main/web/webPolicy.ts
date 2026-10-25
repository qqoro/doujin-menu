export const PC_ONLY_MESSAGE = "PC에서만 사용할 수 있는 기능입니다.";

/**
 * 휴대폰에서 불러도 PC 화면에 창을 띄우거나(파일 선택, 탐색기, 외부 프로그램)
 * 요청한 BrowserWindow에 기대는 채널. 웹 요청에서는 거부한다.
 */
export const PC_ONLY_INVOKE_CHANNELS: ReadonlySet<string> = new Set([
  "add-library-folder",
  "select-external-image-viewer",
  "select-external-archive-viewer",
  "backup-database",
  "restore-database",
  "add-books-from-directory",
  "select-folder",
  "open-book-folder",
  "open-folder-in-explorer",
  "open-with-external-program",
  "open-book-with-external-viewer",
  "open-folder",
  "download-update",
  "install-update",
  "is-fullscreen-window",
  "is-new-window",
  "get-window-maximized-state",
  // 연결 코드와 기기 목록이 들어 있다. 폰이 코드를 읽어 가면 인증이 무의미해진다
  "get-mobile-web-status",
  "revoke-mobile-device",
  "get-mobile-web-running",
]);

export const MOBILE_SETTINGS_MESSAGE =
  "모바일 접속 설정은 PC에서만 바꿀 수 있습니다.";

/** 폰이 스위치를 끄거나, 포트를 바꾸거나, 허용 Host를 늘리지 못하게 한다 */
export function isBlockedWebConfigWrite(
  channel: string,
  args: unknown[],
): boolean {
  if (channel !== "set-config") return false;
  const key = (args[0] as { key?: unknown } | null | undefined)?.key;
  return typeof key === "string" && key.startsWith("mobileWeb");
}

const SECRET_CONFIG_KEY = "appLockPassword";

/** 웹으로 나가는 응답에서 잠금 비밀번호 해시를 걷어낸다 */
export function sanitizeWebResponse(
  channel: string,
  args: unknown[],
  value: unknown,
): unknown {
  if (channel === "get-config" && value && typeof value === "object") {
    const rest = { ...(value as Record<string, unknown>) };
    delete rest[SECRET_CONFIG_KEY];
    return rest;
  }
  if (channel === "get-config-value" && args[0] === SECRET_CONFIG_KEY) {
    return "";
  }
  return value;
}
