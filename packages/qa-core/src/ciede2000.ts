/**
 * CIEDE2000 感知色差（ΔE₀₀）—— R-10 校准用，替代 RGB 欧氏距离。
 *
 * 算法：Sharma et al. (2005) "The CIEDE2000 Color-Difference Formula:
 * Implementation Notes, Supplementary Test Data, and Mathematical Observations"。
 * 这是 CIE 推荐的感知均匀色差度量，克服了 RGB 空间在绿-蓝区的不均匀性。
 *
 * 感知量标（业界通用）：
 *   ΔE < 1   不可感知
 *   1 ≤ ΔE < 2  近距离观察可感知
 *   2 ≤ ΔE < 10 一眼可见
 *   10 ≤ ΔE < 49 颜色比相反更相似
 *
 * 零第三方依赖（qa-core 契约），纯 TS 实现。
 */

import type { RGB } from "@imskin/skin-gen";

// —— RGB → Lab（经 XYZ 中转）——

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** D65 白点 */
const WN = { X: 95.047, Y: 100.0, Z: 108.883 };

export function rgbToLab(rgb: RGB): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100;
  const Y = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100;

  const fx = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const xn = X / WN.X;
  const yn = Y / WN.Y;
  const zn = Z / WN.Z;

  return {
    L: 116 * fx(yn) - 16,
    a: 500 * (fx(xn) - fx(yn)),
    b: 200 * (fx(yn) - fx(zn)),
  };
}

// —— CIEDE2000 ——

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * CIEDE2000 色差。返回 ΔE₀₀（≥0，无量纲）。
 * 实现：Sharma et al. 2005 §2.1 步骤 1–22。
 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  // Step 1: C', h'
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625))); // 25^7

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1p = C1p === 0 ? 0 : deg(Math.atan2(b1, a1p)) >= 0 ? deg(Math.atan2(b1, a1p)) : deg(Math.atan2(b1, a1p)) + 360;
  const h2p = C2p === 0 ? 0 : deg(Math.atan2(b2, a2p)) >= 0 ? deg(Math.atan2(b2, a2p)) : deg(Math.atan2(b2, a2p)) + 360;

  // Step 2: ΔL', ΔC', ΔH'
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  // Step 3: CIEDE2000
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) {
      if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
      else hbarp = (h1p + h2p - 360) / 2;
    } else {
      hbarp = (h1p + h2p) / 2;
    }
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.20 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 6103515625));

  const L50 = Math.pow(Lbarp - 50, 2);
  const SL = 1 + (0.015 * L50) / Math.sqrt(20 + L50);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;

  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  const dL = dLp / SL;
  const dC = dCp / SC;
  const dH = dHp / SH;

  return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
}

/** 便捷：RGB 直接计算 ΔE₀₀。 */
export function ciede2000RGB(rgb1: RGB, rgb2: RGB): number {
  return ciede2000(rgbToLab(rgb1), rgbToLab(rgb2));
}
