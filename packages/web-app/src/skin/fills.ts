/**
 * Fill / 样式 → CSS 的转换。渐进支持：solid、gradient 直接出 CSS；image 九宫格位图
 * 后续接入生成切图时用 Canvas 渲染，此处先给出背景兜底，不静默出错。
 */

import type { CSSProperties } from "react";
import type { Fill, KeyStyle, FontSpec, Shadow } from "@imskin/skin-gen";

export function fillToBackground(fill: Fill): string {
  switch (fill.type) {
    case "solid":
      return fill.color;
    case "gradient":
      return `linear-gradient(${fill.angle ?? 135}deg, ${fill.from}, ${fill.to})`;
    case "image":
      // 位图九宫格渲染为后续增量；先用居中平铺兜底，保证可见而非空白
      return `center / cover no-repeat url(${fill.src})`;
  }
}

export function shadowToCss(s: Shadow): string {
  return `${s.x}px ${s.y}px ${s.blur}px ${s.color}`;
}

export function fontToCss(f: FontSpec): CSSProperties {
  return { fontFamily: f.family, fontSize: f.size, fontWeight: f.weight };
}

/** 合并按键基础样式与（按下/功能键）覆盖样式，产出 React 内联样式。 */
export function keyStyleToCss(base: KeyStyle, override?: Partial<KeyStyle>): CSSProperties {
  const s: KeyStyle = { ...base, ...override };
  const css: CSSProperties = {
    background: fillToBackground(s.fill),
    color: s.color,
    borderRadius: s.radius,
  };
  if (s.border) css.border = `${s.border.width}px solid ${s.border.color}`;
  if (s.shadow) css.boxShadow = shadowToCss(s.shadow);
  return css;
}
