/**
 * 跨出口一致性校验（G5，R-10 校准版）。
 *
 * 同一份设计导出到不同平台时，关键品牌色应保持一致。对两份皮肤比较
 * 最具"品牌辨识度"的颜色——主键盘背景、选中态填充——感知色差（CIEDE2000 ΔE₀₀）
 * 超过阈值即 warning。
 *
 * R-10 校准决策（ADR-009）：
 * - 度量从 RGB 欧氏距离升级为 CIEDE2000（感知均匀，业界标准）
 * - 阈值 ΔE₀₀ ≤ 5（"一眼可辨但仍是同一设计"的边界；Sharma 2005 量标 2-10 区间内取中低值）
 * - gradient 取 from/to 中点转 Lab 后比较；image 降级 undecidable（待 Canvas 渲染后取样）
 * - 位图对比度同走此路径（Canvas 采样点 → RGB → CIEDE2000）
 */

import type { SkinManifest, Fill, RGB } from "@imskin/skin-gen";
import { parseHex } from "@imskin/skin-gen";
import type { QAIssue } from "./types.ts";
import { ciede2000RGB } from "./ciede2000.ts";

/**
 * 感知色差阈值（CIEDE2000 ΔE₀₀）。
 * ADR-009：ΔE₀₀ ≤ 5 = "同一设计允许的平台差异边界"。
 * 量标参考：2-10 = 一眼可见；5 取中低值，允许平台适配微调但阻拦"像两套设计"的分叉。
 */
export const CONSISTENCY_MAX_DELTA_E = 5.0;

/** 比较两份皮肤的跨出口一致性，返回 0..2 条 warning。 */
export function checkConsistency(a: SkinManifest, b: SkinManifest): QAIssue[] {
  const issues: QAIssue[] = [];
  compareFeature(issues, a.keyboard.background, b.keyboard.background, "主键盘背景");
  compareFeature(issues, a.candidateBar.selectedFill, b.candidateBar.selectedFill, "选中态填充");
  return issues;
}

/** 比较两份皮肤同一处填充的代表色。 */
function compareFeature(issues: QAIssue[], fa: Fill, fb: Fill, label: string): void {
  const ca = dominantRGB(fa);
  const cb = dominantRGB(fb);

  if (ca === null || cb === null) {
    issues.push({
      code: "CONSISTENCY_UNDECIDABLE",
      severity: "warning",
      message: `${label}含位图或无法解析的颜色，跨出口一致性待渲染后校验`,
      where: label,
    });
    return;
  }

  const deltaE = ciede2000RGB(ca, cb);
  if (deltaE > CONSISTENCY_MAX_DELTA_E) {
    issues.push({
      code: "CONSISTENCY_DIVERGENCE",
      severity: "warning",
      message: `${label}两出口感知色差 ΔE₀₀=${deltaE.toFixed(1)} > ${CONSISTENCY_MAX_DELTA_E}（${rgbHex(ca)} vs ${rgbHex(cb)}），像两套设计`,
      where: label,
    });
  }
}

/** 取填充的代表色：solid 用其色；gradient 用 from/to 中点；image → null。 */
function dominantRGB(fill: Fill): RGB | null {
  try {
    if (fill.type === "solid") return parseHex(fill.color);
    if (fill.type === "gradient") {
      const p = parseHex(fill.from);
      const q = parseHex(fill.to);
      return { r: (p.r + q.r) / 2, g: (p.g + q.g) / 2, b: (p.b + q.b) / 2 };
    }
    return null; // image
  } catch {
    return null;
  }
}

function rgbHex(c: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
