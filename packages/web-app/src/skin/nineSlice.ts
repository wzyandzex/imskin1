/**
 * 九宫格拉伸（§4.7）—— 位图皮肤背景的正确渲染：四角不拉伸、上下边横向拉伸、左右边纵向拉伸、
 * 中心双向拉伸。几何计算是纯函数（可严格单测），绘制是薄壳（对每格调 ctx.drawImage）。
 *
 * 这修正了此前 image 填充被 CSS 用 center/cover "糊弄"的临时做法——真实位图皮肤需要九宫格
 * 才能在任意键盘尺寸下不变形。生成管线（A3）产出切图后即可直接用。
 */

import type { NineSlice } from "@imskin/skin-gen";

export interface SliceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** 一维三段拆分：返回 [近端, 中段, 远端] 的 [起点, 长度]，对目标端做等比夹取避免角重叠。 */
function bands(
  total: number,
  near: number,
  far: number,
): Array<{ start: number; len: number }> {
  let n = near;
  let f = far;
  if (n + f > total && n + f > 0) {
    const scale = total / (n + f);
    n *= scale;
    f *= scale;
  }
  const mid = Math.max(0, total - n - f);
  return [
    { start: 0, len: n },
    { start: n, len: mid },
    { start: n + mid, len: f },
  ];
}

/**
 * 计算九宫格的 9 个 源→目标 矩形。源角用原始 slice 尺寸（假设 slice ≤ 图尺寸），
 * 目标角在目标过小时等比夹取。长宽为 0 的格子会被过滤（不产生退化 drawImage）。
 */
export function nineSliceRects(
  imgW: number,
  imgH: number,
  slice: NineSlice,
  destW: number,
  destH: number,
): SliceRect[] {
  const srcCols = bands(imgW, slice.left, slice.right);
  const srcRows = bands(imgH, slice.top, slice.bottom);
  const dstCols = bands(destW, slice.left, slice.right);
  const dstRows = bands(destH, slice.top, slice.bottom);

  const out: SliceRect[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sc = srcCols[c];
      const sr = srcRows[r];
      const dc = dstCols[c];
      const dr = dstRows[r];
      if (sc.len <= 0 || sr.len <= 0 || dc.len <= 0 || dr.len <= 0) continue;
      out.push({
        sx: sc.start,
        sy: sr.start,
        sw: sc.len,
        sh: sr.len,
        dx: dc.start,
        dy: dr.start,
        dw: dc.len,
        dh: dr.len,
      });
    }
  }
  return out;
}

/** 把图像按九宫格绘制到目标尺寸。img 为可被 drawImage 接受的源；imgW/imgH 为源的自然尺寸。 */
export function draw9Slice(
  ctx: {
    drawImage(img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  },
  img: unknown,
  imgW: number,
  imgH: number,
  slice: NineSlice,
  destW: number,
  destH: number,
): void {
  for (const r of nineSliceRects(imgW, imgH, slice, destW, destH)) {
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  }
}
