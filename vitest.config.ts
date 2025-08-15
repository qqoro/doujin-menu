import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom", // For Vue components testing
    globals: true, // Allows using describe, it, expect without importing
    coverage: {
      provider: "v8", // Use v8 for coverage
      reporter: ["text", "json", "html"], // Output formats
      include: ["src/**/*.{ts,vue}"], // Include these files for coverage
      exclude: [
        "src/main/**",
        "src/typings/**",
        "src/renderer/api.ts",
        "src/renderer/main.ts",
        "src/renderer/router.ts",
      ], // Exclude main process, typings, and renderer setup files
    },
  },
});
