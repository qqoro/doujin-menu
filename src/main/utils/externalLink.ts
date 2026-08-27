import { shell } from "electron";

const ALLOWED_DOMAINS = [
  "github.com",
  "www.dlsite.com",
  "forms.gle",
  "tweakcn.com",
];

/**
 * `shell.openExternal`은 Windows에서 `file:`이나 커스텀 스킴으로 프로그램을
 * 실행시킬 수 있다. 창 종류나 호출 경로마다 검사가 다르면 그게 우회로가 된다.
 */
export function isAllowedExternalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  // startsWith로 비교하면 `https://github.com.evil.test`가 뚫린다.
  return ALLOWED_DOMAINS.includes(parsed.hostname);
}

export function openExternalIfAllowed(url: string): boolean {
  if (!isAllowedExternalUrl(url)) {
    return false;
  }
  shell.openExternal(url);
  return true;
}
