/**
 * @imskin/qa-core —— A6 发布前校验（架构 §3.4 / 需求 FR-QA）。
 *
 * - 契约：QAIssue / QAReport（及 QASeverity）。
 * - 可读性：checkReadability（文字 vs 背景对比度；gradient 保守取较差端，image 降级 warning）。
 * - 一致性：checkConsistency（跨出口关键品牌色分叉检测）。
 * - 汇总：checkSkin（单份皮肤 → QAReport，无 error 即放行）。
 */

export type { QAIssue, QAReport, QASeverity } from "./types.ts";
export { checkReadability } from "./readability.ts";
export { checkConsistency } from "./consistency.ts";
export { checkSkin } from "./report.ts";
