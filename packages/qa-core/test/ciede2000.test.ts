/**
 * CIEDE2000 测试 —— Sharma et al. (2005) 官方测试向量 + 一致性校准验证。
 * 向量来源：Sharma 2005 Table 1（业界标准验证集，检测实现各分支正确性）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ciede2000, rgbToLab, ciede2000RGB, type Lab } from "../src/ciede2000.ts";
import { checkConsistency, CONSISTENCY_MAX_DELTA_E } from "../src/consistency.ts";
import type { SkinManifest } from "@imskin/skin-gen";

/** Sharma 2005 Table 1 的代表性测试对（覆盖各分支：hue wrap、chroma 边界、RT 项等）。 */
const SHARMA_PAIRS: Array<{ l1: Lab; l2: Lab; expected: number; note: string }> = [
  { l1: { L: 50, a: 2.6772, b: -79.7751 }, l2: { L: 50, a: 0, b: -82.7485 }, expected: 2.0425, note: "pair 1" },
  { l1: { L: 50, a: 3.1571, b: -77.2803 }, l2: { L: 50, a: 0, b: -82.7485 }, expected: 2.8615, note: "pair 2" },
  { l1: { L: 50, a: 2.8361, b: -74.02 }, l2: { L: 50, a: 0, b: -82.7485 }, expected: 3.4412, note: "pair 3" },
  { l1: { L: 50, a: -1.3802, b: -84.2814 }, l2: { L: 50, a: 0, b: -82.7485 }, expected: 1.0, note: "pair 4 (ΔE=1 exact)" },
  { l1: { L: 50, a: 2.5, b: 0 }, l2: { L: 50, a: 3.1736, b: 0.5854 }, expected: 1.0, note: "pair 25" },
  { l1: { L: 50, a: 2.5, b: 0 }, l2: { L: 50, a: 0, b: -2.5 }, expected: 4.3065, note: "pair 33" },
  { l1: { L: 50, a: 2.5, b: 0 }, l2: { L: 73, a: 25, b: -18 }, expected: 27.1492, note: "pair 34" },
  { l1: { L: 50, a: 2.5, b: 0 }, l2: { L: 61, a: -5, b: 29 }, expected: 22.8977, note: "pair 35" },
];

test("CIEDE2000：Sharma 2005 官方测试向量（容差 ±0.0001）", () => {
  for (const p of SHARMA_PAIRS) {
    const got = ciede2000(p.l1, p.l2);
    assert.ok(
      Math.abs(got - p.expected) < 0.0001,
      `${p.note}: got ${got.toFixed(4)}, expected ${p.expected}`,
    );
  }
});

test("CIEDE2000：同一颜色 ΔE=0", () => {
  const lab = { L: 50, a: 10, b: -5 };
  assert.equal(ciede2000(lab, lab), 0);
});

test("rgbToLab：纯黑/纯白/中灰的 Lab 值合理", () => {
  const black = rgbToLab({ r: 0, g: 0, b: 0 });
  const white = rgbToLab({ r: 255, g: 255, b: 255 });
  const gray = rgbToLab({ r: 128, g: 128, b: 128 });
  assert.ok(Math.abs(black.L) < 0.1, `black L≈0, got ${black.L}`);
  assert.ok(Math.abs(white.L - 100) < 0.1, `white L≈100, got ${white.L}`);
  assert.ok(Math.abs(gray.L - 53.6) < 1, `gray L≈53.6, got ${gray.L}`);
});

test("ciede2000RGB：感知合理的色差", () => {
  const red = { r: 255, g: 0, b: 0 };
  const slightlyRed = { r: 250, g: 5, b: 5 };
  const blue = { r: 0, g: 0, b: 255 };

  const close = ciede2000RGB(red, slightlyRed);
  assert.ok(close < 2, `近似色 ΔE 应 < 2，got ${close}`);

  const far = ciede2000RGB(red, blue);
  assert.ok(far > 30, `红↔蓝 ΔE 应 > 30，got ${far}`);
});

// —— 一致性校准验证 ——

function makeSkin(bg: string, sel: string): SkinManifest {
  return {
    id: "test", name: "test",
    meta: { platform: "sogou", device: "pc" },
    keyboard: {
      background: { type: "gradient", from: bg, to: bg, angle: 135 },
      padding: 12, gap: 6,
      key: { fill: { type: "solid", color: "#fff" }, color: "#000", radius: 8 },
      keyActive: {},
      font: { family: "system", size: 16, weight: 500 },
    },
    candidateBar: {
      background: { type: "solid", color: "#eee" },
      composingColor: "#666", candidateColor: "#000",
      selectedColor: "#fff", selectedFill: { type: "solid", color: sel },
      indexColor: "#999",
      font: { family: "system", size: 18, weight: 500 },
    },
  };
}

test("一致性校准：同一设计（同色）→ 无 issue", () => {
  const a = makeSkin("#3faf7d", "#3faf7d");
  const b = makeSkin("#3faf7d", "#3faf7d");
  assert.deepEqual(checkConsistency(a, b), []);
});

test("一致性校准：微调（ΔE < 5）→ 无 issue（允许平台适配微调）", () => {
  const a = makeSkin("#3faf7d", "#3faf7d");
  const b = makeSkin("#35a070", "#40b583"); // 轻微色偏
  assert.deepEqual(checkConsistency(a, b), []);
});

test("一致性校准：分叉（红 vs 蓝）→ CONSISTENCY_DIVERGENCE warning", () => {
  const a = makeSkin("#e5484d", "#e5484d");
  const b = makeSkin("#3b82f6", "#3b82f6");
  const issues = checkConsistency(a, b);
  assert.ok(issues.length >= 1);
  assert.ok(issues.every((i) => i.code === "CONSISTENCY_DIVERGENCE"));
  assert.ok(issues.every((i) => i.message.includes("ΔE₀₀")));
});
