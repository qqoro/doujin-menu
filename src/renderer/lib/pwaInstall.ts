export type InstallMode = "prompt" | "ios-guide" | null;

/**
 * 상단 바의 "앱 설치" 버튼을 어떻게 보일지.
 * 설치는 HTTPS(보안 컨텍스트)에서만 되므로 와이파이(HTTP) 접속에서는 나오지 않는다.
 * 아이폰에는 설치 API가 없어서 공유 메뉴 안내로 대신한다.
 */
export function detectInstallMode(env: {
  remote: boolean;
  secure: boolean;
  standalone: boolean;
  userAgent: string;
  hasPrompt: boolean;
}): InstallMode {
  if (!env.remote || !env.secure || env.standalone) return null;
  if (env.hasPrompt) return "prompt";
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return "ios-guide";
  return null;
}
