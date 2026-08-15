/**
 * 百度 Android 布局（port/ 竖屏 + land/ 横屏 的 .ini）与样式（css.ini）—— 生成器（架构 §2.5→Android）。
 *
 * 笔记（baidu_ime_skin_format_android.md）确证：`port/`、`land/` 下各含若干 `.ini`（布局）、
 * `.cnd`(候选)、`.pop`(提示)；`css.ini` 为皮肤样式，含 `[PANEL][CAND][LIST][INPUT][KEY][BAR][LINE][SWITCH]`
 * 段（颜色/背景键）。键名/编码同级字段字典（见 baidu-mobile-adapter/fields.ts 的 BGtool 确证，
 * 与 Android css.ini 结构同源）。
 *
 * 诚实边界：这是**结构正确、可打包**的最小布局/样式生成器，键值由调用方经 PanelSections/StyleSections
 * 提供（真实切图/精确坐标待 A3 图像生成）；段名与枚举已确证，未覆盖字段可经逃生舱承载。
 */

import { pushSection, pushKv } from "./ini.ts";

/** 布局 .ini 的自由段键值（段名见下 CS）。 */
export interface LayoutIni {
  /** 每个布局文件一组段（如 candidate.ini 的段）。 */
  sections?: { section: string; entries: Record<string, string | number> }[];
  /** 逃生舱：未建模段，原样写出。 */
  extraSections?: { section: string; entries: Record<string, string | number> }[];
}

/** 常用布局段名（[样本确证] Android 主题 css.ini / 布局段）。 */
export const CSS_SECTIONS = {
  panel: "PANEL",
  cand: "CAND",
  list: "LIST",
  input: "INPUT",
  key: "KEY",
  bar: "BAR",
  line: "LINE",
  switch: "SWITCH",
} as const;

/** 生成一个布局 .ini 文本（一组段）。 */
export function emitLayoutIni(layout: LayoutIni): string {
  const lines: string[] = [];
  for (const s of layout.sections ?? []) {
    pushSection(lines, s.section);
    for (const [k, v] of Object.entries(s.entries)) pushKv(lines, k, v);
  }
  for (const s of layout.extraSections ?? []) {
    pushSection(lines, s.section);
    for (const [k, v] of Object.entries(s.entries)) pushKv(lines, k, v);
  }
  return lines.join("\r\n") + "\r\n";
}

/** css.ini 的样式段键值模型。 */
export interface CssIni {
  sections?: Record<string, Record<string, string | number>>;
  /** 逃生舱。 */
  extraSections?: { section: string; entries: Record<string, string | number> }[];
}

/** 生成 css.ini 文本。 */
export function emitCssIni(css: CssIni): string {
  const lines: string[] = [];
  for (const [section, entries] of Object.entries(css.sections ?? {})) {
    pushSection(lines, section);
    for (const [k, v] of Object.entries(entries)) pushKv(lines, k, v);
  }
  for (const s of css.extraSections ?? []) {
    pushSection(lines, s.section);
    for (const [k, v] of Object.entries(s.entries)) pushKv(lines, k, v);
  }
  return lines.join("\r\n") + "\r\n";
}

/** 便捷：把配色/字号写进 css.ini 的 [CAND]/[KEY] 段（供 orchestrator 映射复用）。 */
export function applyPalette(
  css: CssIni,
  palette: { candColor?: string; selectedColor?: string; composingColor?: string; fontSize?: number },
): CssIni {
  const sections = css.sections ?? {};
  const cand = { ...(sections[CSS_SECTIONS.cand] ?? {}) };
  const key = { ...(sections[CSS_SECTIONS.key] ?? {}) };
  if (palette.candColor) cand["COLOR"] = palette.candColor;
  if (palette.selectedColor) cand["HL_COLOR"] = palette.selectedColor;
  if (palette.composingColor) sections[CSS_SECTIONS.input] = { ...(sections[CSS_SECTIONS.input] ?? {}), COLOR: palette.composingColor };
  if (palette.fontSize !== undefined) key["FONT_SIZE"] = palette.fontSize;
  sections[CSS_SECTIONS.cand] = cand;
  sections[CSS_SECTIONS.key] = key;
  return { ...css, sections };
}