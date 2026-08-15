/**
 * 可读性校验（架构 §3.4 / 需求 FR-QA-1）：文字与其背景填充的对比度必须达阈值，否则阻断发布。
 * 校验三处：候选文字/候选栏背景、选中文字/选中底、按键文字/按键填充。
 *
 * 背景是 Fill（solid / gradient / image），按类型分别处理：
 * - solid：直接算对比度；
 * - gradient：对 from/to 两端各算，取**更差端**做保守判断（任一端不达标即判整体不达标，
 *   因为文字会横跨整条渐变，最差处才是真实体验下限）；
 * - image：位图颜色无法静态求得，退化为 warning（PROVISIONAL/待核实：位图对比需渲染后校验，
 *   待接入 Canvas 取样九宫格实际像素）。
 *
 * 另：文字色无法静态解析（如 rgba()/命名色）→ 整处无从判断，退化为 warning；渐变某一端色标无法
 * 解析时，若另一（可解析）端已低于阈值，仍据实报 error（确凿的不可读区域不被无法解析端掩盖，且结果
 * 不依赖 from/to 的先后顺序），否则该端待渲染后校验，降级 warning，均不臆断达标。
 */

import type { SkinManifest, Fill } from "@imskin/skin-gen";
import { contrastRatio, relativeLuminance } from "@imskin/skin-gen";
import type { QAIssue } from "./types.ts";

/** 默认对比度阈值：WCAG AA 正文级 4.5:1。 */
const DEFAULT_MIN_RATIO = 4.5;

/**
 * 校验单份皮肤三处关键文字的可读性，返回 0..3 条 issue。
 * @param minRatio 最低对比度，默认 4.5（WCAG AA）。
 */
export function checkReadability(
  skin: SkinManifest,
  minRatio: number = DEFAULT_MIN_RATIO,
): QAIssue[] {
  const issues: QAIssue[] = [];
  const cb = skin.candidateBar;
  const key = skin.keyboard.key;

  pushIfAny(issues, evaluatePair(cb.candidateColor, cb.background, minRatio, "候选栏 · 候选文字/背景"));
  pushIfAny(issues, evaluatePair(cb.selectedColor, cb.selectedFill, minRatio, "候选栏 · 选中文字/选中底"));
  pushIfAny(issues, evaluatePair(key.color, key.fill, minRatio, "键盘 · 按键文字/按键填充"));

  return issues;
}

/** 评估一处"文字 vs 背景填充"，产出 0 或 1 条 issue。 */
function evaluatePair(text: string, bg: Fill, minRatio: number, where: string): QAIssue | null {
  // 位图：无法静态取色 → warning；附带文字亮度（偏亮/偏暗）提示，便于后续渲染取证。
  if (bg.type === "image") {
    const L = safeLuminance(text);
    const hint = L === null ? "" : `；文字亮度 L=${L.toFixed(2)}（${L >= 0.5 ? "偏亮" : "偏暗"}）`;
    return {
      code: "READABILITY_IMAGE",
      severity: "warning",
      message: `位图对比需渲染后校验（待接入 Canvas）${hint}`,
      where,
    };
  }

  // 文字色本身无法静态解析 → 整处都无从判断，退化为 warning（不臆断达标）。
  if (safeLuminance(text) === null) {
    return {
      code: "READABILITY_UNPARSABLE",
      severity: "warning",
      message: `文字色无法静态解析（${text}），对比度待渲染后校验`,
      where,
    };
  }

  // solid 一个色标；gradient 两个色标（保守取更差端）。
  const stops = bg.type === "solid" ? [bg.color] : [bg.from, bg.to];
  let worst = Number.POSITIVE_INFINITY;
  let unparsableStop: string | null = null;
  for (const stop of stops) {
    const ratio = safeContrast(text, stop);
    if (ratio === null) {
      // 该色标非静态可解析：先记录，但不立即退让——已知色标若已判失败仍应据实报 error。
      unparsableStop = stop;
      continue;
    }
    if (ratio < worst) worst = ratio;
  }

  // 只要有一个"可解析"的端点已低于阈值，就是确凿的不可读区域 → error（不被无法解析的另一端掩盖）。
  if (worst !== Number.POSITIVE_INFINITY && worst < minRatio) {
    const conservative = bg.type === "gradient" ? "（渐变取较差端）" : "";
    return {
      code: "READABILITY_LOW_CONTRAST",
      severity: "error",
      message: `文字与背景对比度 ${worst.toFixed(2)} < ${minRatio}${conservative}`,
      where,
    };
  }

  // 无已知失败，但存在无法静态解析的色标 → 该端待渲染后校验，降级 warning。
  if (unparsableStop !== null) {
    return {
      code: "READABILITY_UNPARSABLE",
      severity: "warning",
      message: `背景存在无法静态解析的颜色（${unparsableStop}），对比度待渲染后校验`,
      where,
    };
  }

  return null;
}

/** contrastRatio 的安全包装：颜色无法解析时返回 null，而非抛异常。 */
function safeContrast(a: string, b: string): number | null {
  try {
    return contrastRatio(a, b);
  } catch {
    return null;
  }
}

/** relativeLuminance 的安全包装：无法解析时返回 null。 */
function safeLuminance(color: string): number | null {
  try {
    return relativeLuminance(color);
  } catch {
    return null;
  }
}

function pushIfAny(arr: QAIssue[], issue: QAIssue | null): void {
  if (issue) arr.push(issue);
}
