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
 * 다이얼로그·팝오버뿐 아니라 메뉴(`role="menu"`)와 셀렉트(`role="listbox"`)도
 * 본다. 빼먹으면 메뉴를 연 채 Esc를 눌렀을 때 메뉴가 닫히면서 창까지 최소화된다.
 *
 * 닫히는 중인 요소는 제외한다. 퇴장 애니메이션이 붙으면 잠깐
 * `data-state="closed"`인 채로 남는다.
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

/** 열려있는 다이얼로그나 오버레이가 있는지 확인한다 */
export function hasOpenDialog(): boolean {
  return !!document.querySelector(OPEN_OVERLAY_SELECTOR);
}
