/**
 * Playwright E2E 配置（ENG-001b）。
 *
 * 运行前提：npm install && npx playwright install chromium
 * 启动方式：先启动 Vite dev server（webServer 配置自动管理）→ 跑测试 → 写证据。
 *
 * 证据输出：测试完成后全局 teardown 把结果写入 docs/evidence/e2e/latest.json，
 * 供交付闸门（outletDeliveryLevel）消费——previewable 的授予依据（docs/03 G6）。
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],

  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
  },

  // 自动启动/停止 Vite dev server
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },

  // 全局 teardown：聚合结果写证据文件
  globalTeardown: "./e2e/teardown.ts",
});
