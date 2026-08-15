/**
 * 颜色与对比度工具（纯函数）—— 皮肤生成的地基之一，直接承载 QA 可读性校验
 * （架构 §3.4 / 需求 FR-QA-1）：候选词/按键文字与背景的对比度必须达阈值，否则自动调整。
 * 采用 WCAG 相对亮度与对比度公式。
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 解析 #rgb / #rrggbb（忽略前导 #，大小写不敏感）。 */
export function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`非法颜色: ${hex}`);
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const clamp = (n: number, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, n));

export function toHex({ r, g, b }: RGB): string {
  const h = (n: number) => clamp(Math.round(n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** WCAG 相对亮度 [0,1]。 */
export function relativeLuminance(color: RGB | string): number {
  const { r, g, b } = typeof color === "string" ? parseHex(color) : color;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 对比度 [1,21]。 */
export function contrastRatio(a: RGB | string, b: RGB | string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: RGB | string, b: RGB | string, t: number): RGB {
  const ca = typeof a === "string" ? parseHex(a) : a;
  const cb = typeof b === "string" ? parseHex(b) : b;
  return {
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  };
}

/** 变亮：向白色混合 amount(0..1)。 */
export function lighten(hex: string, amount: number): string {
  return toHex(mix(hex, { r: 255, g: 255, b: 255 }, amount));
}

/** 变暗：向黑色混合 amount(0..1)。 */
export function darken(hex: string, amount: number): string {
  return toHex(mix(hex, { r: 0, g: 0, b: 0 }, amount));
}

export function isDark(color: RGB | string): boolean {
  return relativeLuminance(color) < 0.5;
}

/**
 * 在给定背景上选一个可读的文字色：从候选里挑对比度最高者；若最高仍低于 minRatio，
 * 则按背景明暗回退到纯黑/纯白（保证达标），并可微调。返回 { color, ratio, adjusted }。
 */
export function readableTextOn(
  bg: string,
  candidates: string[] = ["#1a1a1a", "#ffffff"],
  minRatio = 4.5,
): { color: string; ratio: number; adjusted: boolean } {
  let best = candidates[0];
  let bestRatio = 0;
  for (const c of candidates) {
    const r = contrastRatio(bg, c);
    if (r > bestRatio) {
      bestRatio = r;
      best = c;
    }
  }
  if (bestRatio >= minRatio) {
    return { color: best, ratio: bestRatio, adjusted: false };
  }
  // 回退：纯黑/纯白取对比更高者。数学上 max(黑,白) 对任意背景 ≥ ~4.58，必达 4.5 阈值。
  const black = contrastRatio(bg, "#000000");
  const white = contrastRatio(bg, "#ffffff");
  return white >= black
    ? { color: "#ffffff", ratio: white, adjusted: true }
    : { color: "#000000", ratio: black, adjusted: true };
}
