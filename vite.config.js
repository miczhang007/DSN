import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    clearMocks: true,
    setupFiles: "./tests/setup.js",
    // work/ 下是并行开发的 git worktree，各自带 tests/；私有 cloud-api 独立维护。
    // 不排除会被当成同一项目的测试一并执行，导致基线与全量结果失真。
    exclude: ["**/node_modules/**", "**/dist/**", "work/**", "sticky-note-cloud-api/**"],
  },
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
