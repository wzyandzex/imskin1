/**
 * QA 校验的输出契约（A6 发布前校验，架构 §3.4 / 需求 FR-QA）。
 *
 * 校验器只产出结构化 issue（不抛异常、不静默改皮肤）；是否放行由 QAReport.passed 表达
 * ——无 error 即放行，warning 提示但不阻断。契约保持极简，便于前端逐条展示与定位。
 */

/** 严重级别：error 阻断发布；warning 提示但不阻断。 */
export type QASeverity = "error" | "warning";

/**
 * 单条校验问题。
 * - code：机器可读、稳定的问题类别标识（便于过滤/统计）。
 * - message：面向人的说明，尽量带上实测数值与阈值。
 * - where：人类可读的定位（可选），如"候选栏 · 候选文字/背景"。
 */
export interface QAIssue {
  code: string;
  severity: QASeverity;
  message: string;
  where?: string;
}

/** 一次校验的汇总。passed = issues 中不含任何 error。 */
export interface QAReport {
  passed: boolean;
  issues: QAIssue[];
}
