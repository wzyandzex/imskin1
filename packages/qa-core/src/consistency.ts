/**
 * 跨出口一致性校验（架构 §3.4 / 需求 FR-QA）：避免"同一版皮肤两出口像两套设计"。
 *
 * 同一份设计导出到不同平台（搜狗/百度、PC/移动）时，关键品牌色应保持一致。这里对两份皮肤
 * 比较两处最具"品牌辨识度"的颜色——主键盘背景、选中态填充——色差过大即警示（不阻断发布）。
 *
 * 色差度量：归一化 RGB 欧氏距离（0..1，1=纯黑到纯白）。gradient 取 from/to 中点作代表色，
 * image 无静态主色则跳过并给出 undecidable 提示。
 *
 * PROVISIONAL/待核实：
 * - 阈值 CONSISTENCY_MAX_DISTANCE 为经验取值，尚未用真实搜狗/百度双出口样本标定；
 * - "RGB 欧氏距离"是任务允许的简单度量，但 RGB 空间非感知均匀，感知精确的
 *   CIEDE2000(Delta-E) 待接入。
 */

import type { SkinManifest, Fill, RGB } from "@imskin/skin-gen";
import { parseHex } from "@imskin/skin-gen";
import type { QAIssue } from "./types.ts";

/**
 * 归一化色差阈值（0..1）。超过即认为两出口色彩明显分叉。
 * PROVISIONAL：经验取值，待用真实双出口样本标定。
 */
const CONSISTENCY_MAX_DISTANCE = 0.2;

/** RGB 空间最大欧氏距离（纯黑↔纯白），用于把距离归一化到 0..1。 */
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

/** 比较两份皮肤的跨出口一致性，返回 0..2 条 warning。 */
export function checkConsistency(a: SkinManifest, b: SkinManifest): QAIssue[] {
  const issues: QAIssue[] = [];
  compareFeature(issues, a.keyboard.background, b.keyboard.background, "主键盘背景");
  compareFeature(issues, a.candidateBar.selectedFill, b.candidateBar.selectedFill, "选中态填充");
  return issues;
}

/** 比较两份皮肤同一处填充的代表色，色差过大或无法判定则追加一条 warning。 */
function compareFeature(issues: QAIssue[], fa: Fill, fb: Fill, label: string): void {
  const ca = dominantRGB(fa);
  const cb = dominantRGB(fb);

  if (ca === null || cb === null) {
    // 至少一侧是位图/无法解析 → 无法静态比较（待接入 Canvas 渲染后核对）。
    issues.push({
      code: "CONSISTENCY_UNDECIDABLE",
      severity: "warning",
      message: `${label}含位图或无法解析的颜色，跨出口一致性待渲染后校验`,
      where: label,
    });
    return;
  }

  const dist = normalizedDistance(ca, cb);
  if (dist > CONSISTENCY_MAX_DISTANCE) {
    issues.push({
      code: "CONSISTENCY_DIVERGENCE",
      severity: "warning",
      message: `${label}两出口色差 ${dist.toFixed(2)} > ${CONSISTENCY_MAX_DISTANCE}（${rgbHex(ca)} vs ${rgbHex(cb)}），像两套设计`,
      where: label,
    });
  }
}

/** 取填充的代表色：solid 用其色；gradient 用 from/to 中点；image 无静态色 → null。 */
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
    return null; // 非法/非静态颜色
  }
}

/** 归一化 RGB 欧氏距离，返回 0..1。 */
function normalizedDistance(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / MAX_RGB_DISTANCE;
}

/** RGB → #rrggbb（仅用于消息展示）。 */
function rgbHex(c: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
