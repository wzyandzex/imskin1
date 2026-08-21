/**
 * @imskin/baidu-mobile-adapter —— 百度 Android 皮肤适配层（架构 §2.5→Android）。
 *
 * 按 open-reverselab reverse notes（真实 APK jadx 反编译）重写：Info.txt + Token.txt + preview.png
 * + port/land 布局 + css.ini，而非此前 BGtool.c 的 [KEY n] 模型（真机 .bds 结构）。
 */

export { INFO_KEYS, DIY_TYPE, VIP_TYPE, emitInfo, emitToken, type InfoModel } from "./info.ts";
export {
  CSS_SECTIONS,
  emitLayoutIni,
  emitCssIni,
  applyPalette,
  type LayoutIni,
  type CssIni,
} from "./layout.ts";
export { sanitizeInline } from "./ini.ts";
export { buildBds, type BaiduMobileProject } from "./bds.ts";export { validateBds, type StructuralReport } from "./validate.ts";
