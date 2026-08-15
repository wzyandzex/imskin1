/**
 * 搜狗 Android 布局（theme/<布局>/layout/*.ini）与配色（colors.ini）—— 生成器（架构 §2.4→Android）。
 *
 * 笔记确证：`theme/<布局>/layout/` 下含 candidate.ini / keys.ini / images.ini / cands.ini /
 * images_config.ini / image_list.ini / template.ini 等；`res/`(亮) 与 `resblack/`(暗) 为资源图；
 * `colors.ini`/`theme_colors.ini` 为配色。
 *
 * 诚实边界：结构正确、可打包；精确键名/取值待真机主题模板核实（[PROVISIONAL]），调用方可经
 * sections/extraSections 提供，未覆盖字段走逃生舱。
 */

import { pushSection, pushKv } from "./ini.ts";

/** 一个布局 .ini 文件的内容（一组段）。 */
export interface LayoutIni {
  sections?: { section: string; entries: Record<string, string | number> }[];
  extraSections?: { section: string; entries: Record<string, string | number> }[];
}

/** 常用布局文件名（[样本确证] 主题 layout 目录清单）。 */
export const LAYOUT_FILES = {
  candidate: "candidate.ini",
  keys: "keys.ini",
  images: "images.ini",
  cands: "cands.ini",
  template: "template.ini",
} as const;

/** 生成一个布局 .ini 文本。 */
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

/** 生成 colors.ini（配色）文本。 */
export function emitColorsIni(sections?: Record<string, Record<string, string | number>>): string {
  const lines: string[] = [];
  for (const [section, entries] of Object.entries(sections ?? {})) {
    pushSection(lines, section);
    for (const [k, v] of Object.entries(entries)) pushKv(lines, k, v);
  }
  return lines.join("\r\n") + "\r\n";
}