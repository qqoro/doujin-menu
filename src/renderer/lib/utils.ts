import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 열려있는 다이얼로그나 오버레이가 있는지 확인합니다.
 * shadcn-vue의 Dialog, AlertDialog, Command 등의 오버레이/컨텐츠 요소를 감지합니다.
 * @returns 열려있는 오버레이가 있으면 true, 없으면 false
 */
export function hasOpenDialog(): boolean {
  return !!(
    document.querySelector('[data-slot="dialog-overlay"]') ||
    document.querySelector('[data-slot="dialog-content"]') ||
    document.querySelector('[data-slot="alert-dialog-overlay"]') ||
    document.querySelector('[data-slot="alert-dialog-content"]') ||
    document.querySelector('[role="dialog"]') ||
    document.querySelector('[role="alertdialog"]')
  );
}
