/**
 * 九宫格位图背景层 —— 把 image 填充的皮肤背景用 Canvas 九宫格拉伸渲染（§4.7）。
 * 绝对定位铺满父容器，随父容器尺寸变化（ResizeObserver）与图片加载重绘；按 DPR 适配清晰度。
 * 环境无 Canvas/ResizeObserver（如 jsdom）时安全降级，不抛错。
 */

import { useEffect, useRef } from "react";
import type { NineSlice } from "@imskin/skin-gen";
import { draw9Slice } from "./nineSlice.ts";

interface Props {
  src: string;
  slice: NineSlice;
}

export function NineSliceCanvas({ src, slice }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof Image === "undefined") return;

    const redraw = () => {
      const img = imgRef.current;
      const parent = canvas.parentElement;
      if (!img || !img.complete || img.naturalWidth === 0 || !parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      draw9Slice(ctx, img, img.naturalWidth, img.naturalHeight, slice, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const img = new Image();
    imgRef.current = img;
    img.onload = redraw;
    img.src = src;
    if (img.complete) redraw();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      ro = new ResizeObserver(redraw);
      ro.observe(canvas.parentElement);
    }
    return () => {
      ro?.disconnect();
      img.onload = null; // 卸载/换源后，别让迟到的 onload 再往（可能已脱离文档的）画布上画
    };
  }, [src, slice.top, slice.right, slice.bottom, slice.left]);

  return <canvas ref={canvasRef} className="nine-slice-canvas" data-testid="nine-slice" aria-hidden />;
}
