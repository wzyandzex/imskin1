/**
 * E2E 证据聚合器（ENG-001b）—— Playwright globalTeardown 里调用。
 *
 * 把各 spec 的通过状态聚合为 docs/evidence/e2e/latest.json，
 * 供 orchestrator.outletDeliveryLevel 消费（previewable 授予依据）。
 *
 * 诚实边界：只有**全部必需场景通过**才写 passed=true；任何场景失败/跳过
 * 都写 passed=false（闸门保持 structural，不伪装 previewable）。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface E2EScenarioResult {
  id: string;
  passed: boolean;
  duration: number;
}

export interface E2EEvidence {
  browser: string;
  chromiumVersion: string;
  timestamp: string;
  scenarios: E2EScenarioResult[];
  requiredScenarios: string[];
  passed: boolean; // 全部必需场景通过才 true
}

export const REQUIRED_E2E_SCENARIOS = [
  "gen-brief-confirm",       // 生成→追问→Brief 确认
  "qwerty-input",            // 26 键拼音输入 + 候选选词
  "t9-input",                // 九宫格 T9 输入
  "panel-switch",            // 符号/数字/表情面板切换
  "mode-separation",         // 试打/标注模式分离
  "platform-switch",         // 平台×设备切换加载 profile
  "theme-switch",            // 深浅模式切换
  "version-fork",            // 反馈→新版本
  "confirm-gate",            // 确认→导出门禁
] as const;

/** 由各测试文件在运行时注册结果；teardown 聚合写盘。 */
const results: E2EScenarioResult[] = [];

export function recordScenario(id: string, passed: boolean, duration: number): void {
  results.push({ id, passed, duration });
}

/** teardown 入口：聚合 → 判断 → 写证据文件。 */
export function writeEvidence(): void {
  const scenarioMap = new Map(results.map((r) => [r.id, r]));
  const allPassed = REQUIRED_E2E_SCENARIOS.every((id) => scenarioMap.get(id)?.passed === true);

  const evidence: E2EEvidence = {
    browser: "chromium",
    chromiumVersion: "latest", // 由 Playwright 环境注入，此处占位
    timestamp: new Date().toISOString(),
    scenarios: results,
    requiredScenarios: [...REQUIRED_E2E_SCENARIOS],
    passed: allPassed,
  };

  const out = join(process.cwd(), "..", "..", "docs", "evidence", "e2e", "latest.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(evidence, null, 2), "utf8");
  console.log(`\nE2E evidence: ${allPassed ? "PASSED" : "NOT PASSED"} → ${out}`);
}
