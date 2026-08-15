/**
 * @imskin/skin-gen —— 皮肤生成核心 + 皮肤契约（SkinManifest）。
 *
 * - 契约：SkinManifest 及其构成类型（预览与适配层共用）。
 * - 生成：DesignBrief → VisualSpec（briefToSpec）→ SkinManifest（composeSkin）；
 *   generateSkin 为一步式入口。可读性 QA 内建。
 * - 颜色工具：对比度/亮度/明暗调节/可读文字色。
 */

export type {
  Platform,
  DeviceKind,
  NineSlice,
  Fill,
  Shadow,
  FontSpec,
  KeyStyle,
  KeyboardStyle,
  CandidateBarStyle,
  SkinManifest,
} from "./types.ts";

export type { DesignBrief, VisualSpec, CornerPreference } from "./spec.ts";

export { briefToSpec, deriveThemeBrief } from "./brief.ts";
export { composeSkin, generateSkin, type SkinMeta } from "./compose.ts";

export {
  analyzeIntent,
  refineBrief,
  finalizeBrief,
  type IntentAnalysis,
  type ClarifyQuestion,
} from "./intent.ts";

export {
  parseHex,
  toHex,
  relativeLuminance,
  contrastRatio,
  mix,
  lighten,
  darken,
  isDark,
  readableTextOn,
  type RGB,
} from "./color.ts";

export { SAMPLE_SKINS, EXAMPLE_BRIEFS, coolMinimal, inkStyle } from "./samples.ts";
