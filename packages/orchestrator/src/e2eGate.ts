/**
 * E2E 证据查找（ENG-001b）—— 交付闸门消费 Playwright 写入的证据文件。
 *
 * 查找顺序：docs/evidence/e2e/latest.json（相对于仓库根）。
 * Node 环境从文件系统读；浏览器环境（web-app）从注入的 evidence 对象读
 * （App 在启动时 import 证据文件内容注入——当前简化为 Node 侧读取，
 *  web 侧在 e2e 通过后由 API 代理提供，随 ENG-001b 激活时接入）。
 *
 * 诚实边界：证据文件不存在 = G6 not_run → previewable 不授予。
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface E2EEvidenceFile {
  browser: string;
  chromiumVersion: string;
  timestamp: string;
  scenarios: Array<{ id: string; passed: boolean; duration: number }>;
  requiredScenarios: string[];
  passed: boolean;
}

/** 查找 E2E 证据文件；不存在返回 null（诚实：not_run ≠ failed，但同样不授予）。 */
export function findE2EEvidence(): E2EEvidenceFile | null {
  const candidates = [
    join(process.cwd(), "docs", "evidence", "e2e", "latest.json"),
    join(process.cwd(), "..", "..", "docs", "evidence", "e2e", "latest.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as E2EEvidenceFile;
      } catch {
        return null; // 证据文件损坏 → 视为无证据
      }
    }
  }
  return null;
}

/** G6 判定：E2E 证据存在且 passed=true。 */
export function e2eEvidencePassed(): boolean {
  const ev = findE2EEvidence();
  return ev?.passed === true;
}
