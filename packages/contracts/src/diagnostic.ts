/**
 * Diagnostic —— 结构化诊断（docs/01 §13 / docs/04 §4.2 错误模型）。
 *
 * 用户文案与技术信息分离；secret 与用户素材原文禁止进入任何字段。
 * code 用稳定常量（DIAGNOSTIC_CODES），不散落裸字符串。
 */

import { isOutlet, type Outlet } from "./outlet.ts";

export type Severity = "info" | "warning" | "error";

export const DIAGNOSTIC_CODES = {
  OUTLET_BUILD_FAILED: "OUTLET_BUILD_FAILED",
  OUTLET_STRUCTURAL_INVALID: "OUTLET_STRUCTURAL_INVALID",
  ASSET_MISSING: "ASSET_MISSING",
  ASSET_REFERENCE_UNRESOLVED: "ASSET_REFERENCE_UNRESOLVED",
  QA_ERROR_UNFIXED: "QA_ERROR_UNFIXED",
  VERSION_NOT_CONFIRMED: "VERSION_NOT_CONFIRMED",
  LEGACY_EXPORT_NOT_INSTALL_VERIFIED: "LEGACY_EXPORT_NOT_INSTALL_VERIFIED",
  LLM_FALLBACK: "LLM_FALLBACK",
  IMPORT_INVALID: "IMPORT_INVALID",
} as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];

export interface Diagnostic {
  code: string;
  stage: string;
  severity: Severity;
  /** 可直接展示给用户的文案。 */
  userMessage: string;
  /** 技术细节（不含 secret/用户素材原文），可进日志。 */
  technicalMessage?: string;
  retryable: boolean;
  elementIds?: string[];
  outlets?: Outlet[];
}

const SEVERITIES: readonly Severity[] = ["info", "warning", "error"];

export function isDiagnostic(x: unknown): x is Diagnostic {
  if (typeof x !== "object" || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.code === "string" &&
    d.code.length > 0 &&
    typeof d.stage === "string" &&
    SEVERITIES.includes(d.severity as Severity) &&
    typeof d.userMessage === "string" &&
    d.userMessage.length > 0 &&
    typeof d.retryable === "boolean" &&
    (d.technicalMessage === undefined || typeof d.technicalMessage === "string") &&
    (d.elementIds === undefined ||
      (Array.isArray(d.elementIds) && d.elementIds.every((e) => typeof e === "string"))) &&
    (d.outlets === undefined ||
      (Array.isArray(d.outlets) && d.outlets.every(isOutlet)))
  );
}
