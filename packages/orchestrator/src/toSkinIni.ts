/**
 * SkinManifest → 搜狗 SkinIniModel 的映射（A4 参数装配的搜狗分支的一部分）。
 *
 * 诚实边界：这里把皮肤的**配色/字号**映射进 skin.ini 的 [Display] 段（[ssfconv/样本确证] 字段）。
 * 而**窗口九宫格背景切图、状态栏/按键位图**需要真实生成的 png/apng 资源（A3 资产层，
 * 依赖图像生成，当前未接入）——因此本映射默认不产出 window 段，除非调用方显式提供切图。
 * 字段名/颜色 BGR 编码见 sogou-adapter/INI_KEYS（[ssfconv确证] 颜色+字号；[样本确证] 其余）。
 * 注意：搜狗 [Display] 无独立"序号色/背景色/字体键"（字体族 font_ch/font_en 为 [样本确证] 可选），
 * 故 skin-gen 的 indexColor/背景在此不落 skin.ini（背景由切图承担）。
 */

import type { SkinManifest } from "@imskin/skin-gen";
import type { SkinIniModel, WindowRegion } from "@imskin/sogou-adapter";

export interface ToSkinIniOptions {
  author?: string;
  version?: string;
  info?: string;
  /** [样本确证] 字体族（font_ch/font_en）。 */
  fontCh?: string;
  fontEn?: string;
  /** 显式提供的九宫格背景切图（有真实切图时才产出 window 段）。 */
  horizontalWindow?: WindowRegion;
  verticalWindow?: WindowRegion;
}

export function skinToSkinIni(skin: SkinManifest, opts: ToSkinIniOptions = {}): SkinIniModel {
  const cb = skin.candidateBar;
  const model: SkinIniModel = {
    general: {
      name: skin.name,
      ...(opts.author !== undefined ? { author: opts.author } : {}),
      ...(opts.version !== undefined ? { version: opts.version } : {}),
      ...(opts.info !== undefined ? { info: opts.info } : {}),
    },
    display: {
      fontSize: cb.font.size,
      pinyinColor: cb.composingColor, // 拼音串
      firstColor: cb.selectedColor, // 首选/选中候选
      candColor: cb.candidateColor, // 其余候选
      ...(opts.fontCh !== undefined ? { fontCh: opts.fontCh } : {}),
      ...(opts.fontEn !== undefined ? { fontEn: opts.fontEn } : {}),
    },
  };
  if (opts.horizontalWindow) model.horizontalWindow = opts.horizontalWindow;
  if (opts.verticalWindow) model.verticalWindow = opts.verticalWindow;
  return model;
}
