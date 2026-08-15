/**
 * SkinManifest → 百度 Android 皮肤配置的映射（A4 参数装配的百度移动分支）。
 *
 * 把皮肤的配色/字号写入 css.ini 的 [CAND]/[KEY]/[INPUT] 段（真机 .bds 结构，见
 * baidu-mobile-adapter；字段经真实 APK 逆向确证）。port/land 布局与真实切图坐标
 * 由调用方提供（A3 资产层，依赖图像生成，未接入）；缺省则产出结构正确的骨架。
 */

import type { SkinManifest } from "@imskin/skin-gen";
import { applyPalette, type BaiduMobileProject } from "@imskin/baidu-mobile-adapter";

export interface ToBaiduOptions {
  author?: string;
}

/** 从 SkinManifest 生成百度 Android 皮肤工程（配色/字号已映射；布局/切图留骨架）。 */
export function skinToBaiduMobile(skin: SkinManifest, opts: ToBaiduOptions = {}): BaiduMobileProject {
  const cb = skin.candidateBar;
  const css = applyPalette(
    { sections: {} },
    {
      candColor: cb.candidateColor,
      selectedColor: cb.selectedColor,
      composingColor: cb.composingColor,
      fontSize: cb.font.size,
    },
  );
  return {
    id: skin.id,
    name: skin.name,
    info: { name: skin.name, author: opts.author, diyType: 2 },
    css,
  };
}