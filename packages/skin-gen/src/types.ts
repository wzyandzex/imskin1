/**
 * 皮肤资源模型（SkinManifest）—— 生成管线（A3/A4）产出、预览与适配层消费的**契约**。
 * 契约放在 skin-gen（生产者）内，web-app 只作为消费者 import。
 *
 * 填充渐进支持：solid / gradient 现在就能被 CSS 忠实渲染；image 九宫格位图待接入生成切图
 * （用 Canvas 九宫格拉伸）——类型先占位，渲染层按能力渐进支持，非最小方案。
 */

export type Platform = "sogou" | "baidu";
export type DeviceKind = "pc" | "mobile";

/** 九宫格拉伸边距（上右下左，像素），image 填充时四角不拉伸。 */
export interface NineSlice {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Fill =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle?: number }
  | { type: "image"; src: string; slice?: NineSlice };

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  color: string;
}

export interface FontSpec {
  family: string;
  size: number;
  weight: number;
}

export interface KeyStyle {
  fill: Fill;
  color: string;
  radius: number;
  border?: { width: number; color: string };
  shadow?: Shadow;
}

export interface KeyboardStyle {
  background: Fill;
  padding: number;
  gap: number;
  key: KeyStyle;
  keyActive: Partial<KeyStyle>;
  specialKey?: Partial<KeyStyle>;
  font: FontSpec;
}

export interface CandidateBarStyle {
  background: Fill;
  composingColor: string;
  candidateColor: string;
  selectedColor: string;
  selectedFill: Fill;
  indexColor: string;
  font: FontSpec;
}

export interface SkinManifest {
  id: string;
  name: string;
  meta: {
    platform: Platform;
    device: DeviceKind;
    mood?: string;
  };
  keyboard: KeyboardStyle;
  candidateBar: CandidateBarStyle;
}
