/**
 * ChangeInstructionV1 —— A5 反馈解析的结构化修改指令（docs/01 §11）。
 *
 * 现状：feedback-core 仍以关键词路由（PIPE-001 迁移）；本契约先冻结目标形态：
 * 目标元素 / 目标出口 / 操作 / 保留集 / 置信度，低置信度须先请求用户确认目标。
 */

import { isOutlet, type Outlet } from "./outlet.ts";

export type FeedbackCategory =
  | "asset_param"
  | "layout"
  | "style"
  | "platform"
  | "interaction";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "asset_param",
  "layout",
  "style",
  "platform",
  "interaction",
];

export type ChangeOperation = "set" | "adjust" | "replace" | "remove" | "regenerate";

export const CHANGE_OPERATIONS: readonly ChangeOperation[] = [
  "set",
  "adjust",
  "replace",
  "remove",
  "regenerate",
];

/** 平台类指令必须至少有一个目标出口（docs/01 §11 不变量）。 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export interface ChangeInstructionV1 {
  schemaVersion: 1;
  category: FeedbackCategory;
  targetElementIds: string[];
  /** 空 = 作用于全部出口（通用风格反馈）。 */
  targetOutlets: Outlet[];
  operation: ChangeOperation;
  /** 语义字段路径（如 "candidateBar.fontSize"）；remove/regenerate 可为空串。 */
  fieldPath: string;
  value?: unknown;
  delta?: number;
  preserveElementIds: string[];
  confidence: number;
  reason: string;
}

export function isChangeInstruction(x: unknown): x is ChangeInstructionV1 {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  const strArr = (v: unknown): boolean =>
    Array.isArray(v) && v.every((e) => typeof e === "string" && e.length > 0);
  return (
    c.schemaVersion === 1 &&
    FEEDBACK_CATEGORIES.includes(c.category as FeedbackCategory) &&
    strArr(c.targetElementIds) &&
    Array.isArray(c.targetOutlets) &&
    (c.targetOutlets as unknown[]).every(isOutlet) &&
    CHANGE_OPERATIONS.includes(c.operation as ChangeOperation) &&
    typeof c.fieldPath === "string" &&
    strArr(c.preserveElementIds) &&
    typeof c.confidence === "number" &&
    c.confidence >= 0 &&
    c.confidence <= 1 &&
    typeof c.reason === "string" &&
    (c.delta === undefined || typeof c.delta === "number")
  );
}

/** 平台类指令的出口不变量。 */
export function instructionOutletsValid(c: ChangeInstructionV1): boolean {
  return c.category !== "platform" || c.targetOutlets.length > 0;
}

/** 低置信度指令默认需用户确认目标（docs/01 §11）。 */
export function needsTargetConfirmation(c: ChangeInstructionV1): boolean {
  return c.confidence < LOW_CONFIDENCE_THRESHOLD;
}
