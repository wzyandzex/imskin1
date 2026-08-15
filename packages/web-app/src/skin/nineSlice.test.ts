import { describe, test, expect } from "vitest";
import { nineSliceRects, draw9Slice } from "./nineSlice.ts";

const S = { top: 10, right: 10, bottom: 10, left: 10 };

describe("nineSliceRects 几何", () => {
  test("放大：四角保持源尺寸，中心双向拉伸", () => {
    const rects = nineSliceRects(100, 100, S, 200, 200);
    expect(rects.length).toBe(9);
    // 左上角：源(0,0,10,10) → 目标(0,0,10,10)，不拉伸
    expect(rects[0]).toMatchObject({ sx: 0, sy: 0, sw: 10, sh: 10, dx: 0, dy: 0, dw: 10, dh: 10 });
    // 右下角：源(90,90,10,10) → 目标(190,190,10,10)
    expect(rects[8]).toMatchObject({ sx: 90, sy: 90, sw: 10, sh: 10, dx: 190, dy: 190, dw: 10, dh: 10 });
    // 中心：源(10,10,80,80) → 目标(10,10,180,180)
    expect(rects[4]).toMatchObject({ sx: 10, sy: 10, sw: 80, sh: 80, dx: 10, dy: 10, dw: 180, dh: 180 });
  });

  test("上边缘横向拉伸、纵向不变；左边缘纵向拉伸、横向不变", () => {
    const rects = nineSliceRects(100, 100, S, 200, 300);
    const top = rects[1]; // 第一行中列
    expect(top).toMatchObject({ sw: 80, sh: 10, dw: 180, dh: 10 }); // 横向 80→180，纵向 10→10
    const left = rects[3]; // 第二行左列
    expect(left).toMatchObject({ sw: 10, sh: 80, dw: 10, dh: 280 }); // 纵向 80→280，横向 10→10
  });

  test("目标过小：角等比夹取，退化格被过滤", () => {
    const rects = nineSliceRects(100, 100, S, 15, 15); // left+right=20 > 15 → 夹取到 7.5+7.5，中段=0
    // 中段/边格 dw 或 dh 为 0 被过滤，只剩 4 个角
    expect(rects.length).toBe(4);
    for (const r of rects) {
      expect(r.dw).toBeCloseTo(7.5, 5);
      expect(r.dh).toBeCloseTo(7.5, 5);
    }
  });

  test("非对称 slice", () => {
    const rects = nineSliceRects(50, 40, { top: 5, right: 8, bottom: 6, left: 4 }, 100, 100);
    expect(rects[0]).toMatchObject({ sw: 4, sh: 5, dw: 4, dh: 5 }); // 左上角保形
    // 中心源宽 = 50-4-8=38；目标宽=100-4-8=88
    expect(rects[4]).toMatchObject({ sw: 38, dw: 88 });
  });
});

describe("draw9Slice 绘制路径", () => {
  test("对每个非退化格调用一次 drawImage，参数与几何一致", () => {
    const calls: number[][] = [];
    const ctx = {
      drawImage: (_img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
        calls.push([sx, sy, sw, sh, dx, dy, dw, dh]);
      },
    };
    draw9Slice(ctx, {}, 100, 100, S, 200, 200);
    expect(calls.length).toBe(9);
    // 中心格
    expect(calls).toContainEqual([10, 10, 80, 80, 10, 10, 180, 180]);
    // 左上角
    expect(calls).toContainEqual([0, 0, 10, 10, 0, 0, 10, 10]);
  });
});
