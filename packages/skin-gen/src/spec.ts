/**
 * 设计意图 → 视觉规格 的数据契约。
 *
 * DesignBrief：智能体 A1 产出、用户可确认/编辑的结构化设计简报（架构 §7.2 的子集）。
 * VisualSpec：A2 产出的"已解析设计 token"——把简报里的模糊意图落成具体颜色/圆角/字体数值，
 *             再由 compose 映射成 SkinManifest。两步式：意图 → token → 皮肤。
 */

import type { Platform, DeviceKind, FontSpec, Shadow } from "./types.ts";

export type CornerPreference = "small" | "medium" | "large";

export interface DesignBrief {
  styleKeywords: string[];
  palette: {
    primary: string;
    accent?: string;
    background?: string;
  };
  mood?: string;
  cornerRadius?: CornerPreference;
  /** 材质方向，如"哑光纸质感"/"玻璃拟态"；影响阴影/描边。 */
  materialDirection?: string;
  platform?: Platform;
  device?: DeviceKind;
  /** 强制主题（FR-QA-3 深浅双模式派生变体用）；不设则由背景/情绪推断。 */
  theme?: "light" | "dark";
  /** 哪些字段是智能体推断而非用户明确指定（前端高亮用；架构 §7.2）。 */
  inferredFields?: string[];
}

/** 已解析的视觉 token（扁平），compose 据此产出 SkinManifest。 */
export interface VisualSpec {
  theme: "light" | "dark";
  keyboard: {
    bgFrom: string;
    bgTo: string;
    bgAngle: number;
    keyFill: string;
    keyFillTo?: string;
    keyText: string;
    keyRadius: number;
    keyActiveFill: string;
    keyBorder?: string;
    specialKeyFill: string;
    specialKeyText: string;
    padding: number;
    gap: number;
    shadow?: Shadow;
    font: FontSpec;
  };
  candidateBar: {
    bg: string;
    composing: string;
    candidate: string;
    selectedText: string;
    selectedFill: string;
    index: string;
    font: FontSpec;
  };
  /** QA 记录：因可读性阈值被自动调整过的项（架构 §3.4 / FR-QA-1）。 */
  qaAdjustments: string[];
}
