/**
 * A2/A3 衔接：VisualSpec（设计 token）→ SkinManifest（可渲染/可打包的皮肤契约）。
 * 以及 generateSkin：DesignBrief → SkinManifest 的一步式便捷入口。
 */

import type { SkinManifest, Fill, Platform, DeviceKind } from "./types.ts";
import type { DesignBrief, VisualSpec } from "./spec.ts";
import { briefToSpec } from "./brief.ts";

export interface SkinMeta {
  id: string;
  name: string;
  platform?: Platform;
  device?: DeviceKind;
  mood?: string;
}

export function composeSkin(spec: VisualSpec, meta: SkinMeta): SkinManifest {
  const kb = spec.keyboard;
  const cb = spec.candidateBar;

  const keyFill: Fill = kb.keyFillTo
    ? { type: "gradient", from: kb.keyFill, to: kb.keyFillTo, angle: 135 }
    : { type: "solid", color: kb.keyFill };

  return {
    id: meta.id,
    name: meta.name,
    meta: {
      platform: meta.platform ?? "sogou",
      device: meta.device ?? "pc",
      mood: meta.mood,
    },
    keyboard: {
      background: { type: "gradient", from: kb.bgFrom, to: kb.bgTo, angle: kb.bgAngle },
      padding: kb.padding,
      gap: kb.gap,
      key: {
        fill: keyFill,
        color: kb.keyText,
        radius: kb.keyRadius,
        border: kb.keyBorder ? { width: 1, color: kb.keyBorder } : undefined,
        shadow: kb.shadow,
      },
      keyActive: { fill: { type: "solid", color: kb.keyActiveFill } },
      specialKey: {
        fill: { type: "solid", color: kb.specialKeyFill },
        color: kb.specialKeyText,
      },
      font: kb.font,
    },
    candidateBar: {
      background: { type: "solid", color: cb.bg },
      composingColor: cb.composing,
      candidateColor: cb.candidate,
      selectedColor: cb.selectedText,
      selectedFill: { type: "solid", color: cb.selectedFill },
      indexColor: cb.index,
      font: cb.font,
    },
  };
}

/** 一步式：设计简报 → 皮肤。 */
export function generateSkin(brief: DesignBrief, meta: SkinMeta): SkinManifest {
  return composeSkin(briefToSpec(brief), {
    platform: brief.platform,
    device: brief.device,
    mood: brief.mood,
    ...meta,
  });
}
