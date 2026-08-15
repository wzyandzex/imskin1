/**
 * 单份皮肤的发布前校验汇总（A6，架构 §3.4）。
 *
 * 当前汇总可读性校验：passed = issues 中不含 error（warning 不阻断放行）。
 * 跨出口一致性需两份皮肤参与，见 checkConsistency，不并入单份 checkSkin。
 */

import type { SkinManifest } from "@imskin/skin-gen";
import type { QAReport } from "./types.ts";
import { checkReadability } from "./readability.ts";

/** 汇总单份皮肤的校验结果。 */
export function checkSkin(skin: SkinManifest): QAReport {
  const issues = checkReadability(skin);
  const passed = !issues.some((i) => i.severity === "error");
  return { passed, issues };
}
