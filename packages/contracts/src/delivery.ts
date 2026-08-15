/**
 * DeliveryLevel —— 出口交付等级（docs/00 §1 / ADR-001）。
 *
 * blocked 不参与大小比较（它表示"有阻断"，不是更低的完成度）；
 * isAtLeast 只对有序五级生效。
 */

import type { ParseResult } from "./parse.ts";

export type DeliveryLevel =
  | "not_started"
  | "structural"
  | "previewable"
  | "install_candidate"
  | "install_verified"
  | "blocked";

/** 有序等级（低 → 高）；blocked 除外。 */
export const DELIVERY_ORDER: readonly Exclude<DeliveryLevel, "blocked">[] = [
  "not_started",
  "structural",
  "previewable",
  "install_candidate",
  "install_verified",
];

export function isDeliveryLevel(x: unknown): x is DeliveryLevel {
  return (
    typeof x === "string" &&
    (x === "blocked" || (DELIVERY_ORDER as readonly string[]).includes(x))
  );
}

export function parseDeliveryLevel(x: unknown): ParseResult<DeliveryLevel> {
  if (isDeliveryLevel(x)) return { ok: true, value: x };
  return {
    ok: false,
    issues: [`deliveryLevel "${String(x)}" 不在 ${[...DELIVERY_ORDER, "blocked"].join(" / ")} 中`],
  };
}

/** level 是否不低于 min。blocked 与任何比较均为 false（相等除外）。 */
export function isAtLeast(level: DeliveryLevel, min: DeliveryLevel): boolean {
  if (level === min) return true;
  if (level === "blocked" || min === "blocked") return false;
  return DELIVERY_ORDER.indexOf(level) >= DELIVERY_ORDER.indexOf(min);
}

/** 「可对用户称可安装」的唯一等级（docs/00 §1）。 */
export function isInstallable(level: DeliveryLevel): boolean {
  return level === "install_verified";
}
