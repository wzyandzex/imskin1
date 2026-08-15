import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 说明：@imskin/pinyin-engine 是 workspace 源码包（TS，无构建产物）。
// Vite 跟随符号链接解析到 packages/pinyin-engine 真实路径并按普通源码转译；
// optimizeDeps.exclude 避免把它当第三方依赖预打包。
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@imskin/pinyin-engine"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
