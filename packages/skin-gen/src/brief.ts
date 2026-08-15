/**
 * A2 视觉设计（确定性核心）：DesignBrief → VisualSpec。
 *
 * 把模糊意图落成具体 token：主色 + 情绪/关键词 → 明暗主题、键盘渐变、按键填充、文字色、
 * 圆角、字体族、阴影。**可读性 QA 内建**（架构 §3.4 / FR-QA-1）：所有文字色都过对比度关，
 * 不达阈值自动调整并记录，保证"生成即达标"，而非把问题推给用户。
 *
 * 说明：这是确定性映射，是 A2 的骨架；LLM 增强（更细腻的审美判断）可后续接在同一 DesignBrief
 * 契约之后，不改下游。
 */

import type { DesignBrief, VisualSpec } from "./spec.ts";
import { lighten, darken, mix, toHex, isDark, readableTextOn, contrastRatio } from "./color.ts";

/**
 * 派生指定主题的变体简报（FR-QA-3 深浅双模式）：强制 theme、去掉会压住派生主题的显式背景。
 * briefToSpec 据 `brief.theme` 产出对应主题的 VisualSpec；两变体均内建可读性 QA（达标非反相）。
 */
export function deriveThemeBrief(brief: DesignBrief, theme: "light" | "dark"): DesignBrief {
  const { background, ...paletteRest } = brief.palette;
  return { ...brief, palette: paletteRest, theme };
}

const SANS = "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
const SERIF = "'Songti SC', 'STSong', 'SimSun', serif";

const DARK_MOOD = ["水墨", "沉静", "夜", "暗", "复古", "神秘", "深邃", "国潮", "墨", "赛博", "cyber", "dark"];
const SERIF_HINT = ["水墨", "国潮", "古典", "书法", "中国风", "复古", "文艺", "serif"];
const ROUND_HINT = ["圆", "可爱", "软", "萌", "friendly", "round"];
const SHARP_HINT = ["极简", "硬朗", "科技", "锐", "sharp", "minimal"];

function hasAny(hay: string[], needles: string[]): boolean {
  return hay.some((h) => needles.some((n) => h.includes(n)));
}

function radiusFrom(brief: DesignBrief, tags: string[]): number {
  if (brief.cornerRadius === "small") return 6;
  if (brief.cornerRadius === "large") return 16;
  if (brief.cornerRadius === "medium") return 10;
  if (hasAny(tags, ROUND_HINT)) return 16;
  if (hasAny(tags, SHARP_HINT)) return 8;
  return 10;
}

export function briefToSpec(brief: DesignBrief): VisualSpec {
  const tags = [...brief.styleKeywords, brief.mood ?? "", brief.materialDirection ?? ""];
  const primary = brief.palette.primary;
  const accent = brief.palette.accent ?? primary;
  const qa: string[] = [];

  // 主题：显式 theme 优先（深浅双模式派生）；否则有背景色则据其明暗；再按情绪关键词；再退回浅色
  const theme: "light" | "dark" = brief.theme
    ? brief.theme
    : brief.palette.background
      ? isDark(brief.palette.background)
        ? "dark"
        : "light"
      : hasAny(tags, DARK_MOOD)
        ? "dark"
        : "light";

  const serif = hasAny(tags, SERIF_HINT);
  const font = { family: serif ? SERIF : SANS, size: 18, weight: 500 };
  const radius = radiusFrom(brief, tags);

  // 键盘背景渐变：显式 theme 派生时忽略显式 background（避免"水墨 brief 派生出浅色但背景仍是深色"）
  const explicitBg = brief.theme ? undefined : brief.palette.background;
  const bgFrom =
    explicitBg ?? (theme === "dark" ? darken(primary, 0.72) : lighten(primary, 0.86));
  const bgTo = theme === "dark" ? darken(bgFrom, 0.25) : darken(bgFrom, 0.06);
  const bgAngle = 135;

  // 按键填充与文字（QA 保证可读）
  const keyFill = theme === "dark" ? lighten(bgFrom, 0.08) : toHex(mix("#ffffff", primary, 0.05));
  const keyFillTo = theme === "dark" ? darken(keyFill, 0.06) : darken(keyFill, 0.04);
  const keyTextRes = readableTextOn(
    keyFill,
    theme === "dark" ? ["#f0ece4", lighten(primary, 0.6)] : [darken(primary, 0.55), "#1f2530"],
  );
  if (keyTextRes.adjusted) qa.push("按键文字色因对比度自动调整");
  const keyText = keyTextRes.color;

  const keyActiveFill =
    theme === "dark" ? toHex(mix(keyFill, accent, 0.4)) : toHex(mix(keyFill, accent, 0.22));
  const keyBorder = theme === "dark" ? "rgba(255,255,255,0.06)" : undefined;

  const specialKeyFill = theme === "dark" ? darken(bgFrom, 0.15) : darken(bgFrom, 0.07);
  const specialKeyRes = readableTextOn(
    specialKeyFill,
    theme === "dark" ? ["#c9c2b6", "#ffffff"] : ["#33404f", "#000000"],
  );
  if (specialKeyRes.adjusted) qa.push("功能键文字色因对比度自动调整");

  // 阴影：材质方向影响
  const material = brief.materialDirection ?? "";
  const shadow =
    theme === "light"
      ? { x: 0, y: 1, blur: material.includes("玻璃") ? 8 : 3, color: "rgba(30,40,60,0.16)" }
      : { x: 0, y: 1, blur: 2, color: "rgba(0,0,0,0.45)" };

  // 候选栏
  const candBarBg = theme === "dark" ? darken(bgFrom, 0.2) : lighten(bgFrom, 0.4);
  const candTextRes = readableTextOn(
    candBarBg,
    theme === "dark" ? ["#ece7dd", "#ffffff"] : ["#2b3440", "#000000"],
  );
  if (candTextRes.adjusted) qa.push("候选词文字色因对比度自动调整");
  const composing = toHex(mix(candTextRes.color, candBarBg, 0.45));

  const selectedFill = accent;
  const selectedTextRes = readableTextOn(selectedFill, ["#ffffff", "#1a1a1a"]);
  if (selectedTextRes.adjusted || contrastRatio(selectedFill, selectedTextRes.color) < 4.5) {
    qa.push("选中候选文字色因对比度自动调整");
  }
  const indexColor = toHex(mix(candTextRes.color, candBarBg, 0.6));

  return {
    theme,
    keyboard: {
      bgFrom,
      bgTo,
      bgAngle,
      keyFill,
      keyFillTo,
      keyText,
      keyRadius: radius,
      keyActiveFill,
      keyBorder,
      specialKeyFill,
      specialKeyText: specialKeyRes.color,
      padding: 14,
      gap: 8,
      shadow,
      font,
    },
    candidateBar: {
      bg: candBarBg,
      composing,
      candidate: candTextRes.color,
      selectedText: selectedTextRes.color,
      selectedFill,
      index: indexColor,
      font,
    },
    qaAdjustments: qa,
  };
}
