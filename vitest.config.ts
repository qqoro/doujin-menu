import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "node", // Changed to node for main process testing
    globals: true, // Allows using describe, it, expect without importing
    coverage: {
      provider: "v8", // Use v8 for coverage
      reporter: ["text", "json", "html"], // Output formats
      include: ["src/**/*.{ts,vue}"], // Include these files for coverage
      exclude: [
        "src/main/main.ts", // Electron 메인 프로세스 엔트리포인트
        "src/main/preload.ts", // Preload 스크립트
        "src/main/updater.ts", // 업데이터
        "src/main/db/**", // DB 마이그레이션 및 설정
        "src/main/workers/**", // 워커 스레드
        "src/typings/**",
        "src/renderer/api.ts",
        "src/renderer/main.ts",
        "src/renderer/router.ts",
        "src/renderer/components/ui/**", // shadcn-vue UI 컴포넌트
      ], // Exclude setup files but allow handlers and parsers
    },
  },
});
