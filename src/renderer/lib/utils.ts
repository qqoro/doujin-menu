import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지금 떠 있는 오버레이를 가리키는 선택자들.
 *
 * 다이얼로그·경고 다이얼로그·팝오버(팝오버 컨텐츠는 `role="dialog"`)에 더해
 * **메뉴와 목록도 본다.** 드롭다운과 우클릭 메뉴는 `role="menu"`, 셀렉트는
 * `role="listbox"`로 뜨는데 이걸 빼먹으면 메뉴를 연 채 Esc를 눌렀을 때 메뉴가
 * 닫히면서 창까지 최소화된다(Reka UI가 Esc로 메뉴를 닫는 것과 별개로 전역
 * 단축키가 같이 실행된다).
 *
 * 닫히는 중인 요소는 제외한다. Reka UI는 닫을 때 노드를 지우지만, 퇴장
 * 애니메이션이 붙으면 잠깐 `data-state="closed"`인 채로 남는다.
 */
const OPEN_OVERLAY_SELECTOR = [
  '[data-slot="dialog-overlay"]',
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="alert-dialog-content"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
]
  .map((selector) => `${selector}:not([data-state="closed"])`)
  .join(",");

/**
 * 열려있는 다이얼로그나 오버레이가 있는지 확인합니다.
 * @returns 열려있는 오버레이가 있으면 true, 없으면 false
 */
export function hasOpenDialog(): boolean {
  return !!document.querySelector(OPEN_OVERLAY_SELECTOR);
}
