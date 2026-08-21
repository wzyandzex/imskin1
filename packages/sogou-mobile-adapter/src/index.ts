/**
 * @imskin/sogou-mobile-adapter —— 搜狗 Android 皮肤适配层（架构 §2.4→Android）。
 *
 * 按 open-reverselab reverse notes（真实 APK jadx 反编译）落地：phoneTheme.ini + theme/<布局>/layout
 * + res/resblack → 普通 ZIP .ssf。
 */

export { THEME_KEYS, emitPhoneTheme, emitSkinIni, type ThemeModel } from "./theme.ts";
export { LAYOUT_FILES, emitLayoutIni, emitColorsIni, type LayoutIni } from "./layout.ts";
export { sanitizeInline } from "./ini.ts";
export { buildSsf, type SogouMobileProject } from "./ssf.ts";export { validateSogouMobileSsf, type StructuralReport } from "./validate.ts";
