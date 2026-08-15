/**
 * SkinManifest → 百度 PC 皮肤配置的映射（A4 参数装配的百度 PC 分支）。
 *
 * 按 baidu-pc-adapter（字段经真实皮肤解包确证）把元数据与候选栏配色/字号映射进
 * Candidate.xml 的 CCandidateWin 属性（clrCand/clrHilightCand/clrComp/fontCand 等，
 * 见 baidu_ime_skin_format.md §6.1）。真实位图/精确布局坐标由调用方提供（A3 资产层，未接入）；
 * 缺省产出结构正确的可打包骨架。
 */

import type { SkinManifest } from "@imskin/skin-gen";
import type { BaiduPcProject } from "@imskin/baidu-pc-adapter";

export interface ToBaiduPcOptions {
  author?: string;
  email?: string;
  /** 候选窗尺寸（如 "280,120"），缺省给出合理默认。 */
  candidateSize?: string;
}

/** 从 SkinManifest 生成百度 PC 皮肤工程（配色/字号映射进 Candidate.xml；位图留骨架）。 */
export function skinToBaiduPc(skin: SkinManifest, opts: ToBaiduPcOptions = {}): BaiduPcProject {
  const cb = skin.candidateBar;
  return {
    id: skin.id,
    name: skin.name,
    meta: { name: skin.name, author: opts.author, email: opts.email },
    candidate: {
      windows: [
        {
          tag: "CCandidateWin",
          attrs: {
            size: opts.candidateSize ?? "280,120",
            // 颜色族（[样本确证]）：clrCand=候选词、clrHilightCand=高亮候选、clrComp=拼音串
            clrCand: cb.candidateColor,
            clrHilightCand: cb.selectedColor,
            clrComp: cb.composingColor,
            fontCand: `${cb.font.family} ${cb.font.size}px`,
          },
        },
      ],
    },
    status: { windows: [{ tag: "CStatusWin", attrs: { size: "191,82" }, children: [] }] },
  };
}