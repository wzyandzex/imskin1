import { test } from "node:test";
import assert from "node:assert/strict";

import { briefToSpec } from "../src/brief.ts";
import { composeSkin, generateSkin } from "../src/compose.ts";
import { contrastRatio } from "../src/color.ts";
import { EXAMPLE_BRIEFS } from "../src/samples.ts";
import type { DesignBrief } from "../src/spec.ts";

test("背景明暗决定主题", () => {
  assert.equal(briefToSpec({ styleKeywords: [], palette: { primary: "#4a90e2", background: "#12101c" } }).theme, "dark");
  assert.equal(briefToSpec({ styleKeywords: [], palette: { primary: "#4a90e2", background: "#eef2f7" } }).theme, "light");
});

test("无背景时按情绪关键词推主题", () => {
  assert.equal(briefToSpec({ styleKeywords: ["水墨", "国潮"], palette: { primary: "#9e2b25" } }).theme, "dark");
  assert.equal(briefToSpec({ styleKeywords: ["清新"], palette: { primary: "#3faf7d" } }).theme, "light");
});

test("国潮/水墨关键词 → 衬线字；圆角偏好生效", () => {
  const serif = briefToSpec({ styleKeywords: ["国潮", "书法"], palette: { primary: "#9e2b25" }, cornerRadius: "large" });
  assert.match(serif.keyboard.font.family, /Songti|SimSun|serif/);
  assert.equal(serif.keyboard.keyRadius, 16);
  const sharp = briefToSpec({ styleKeywords: ["极简"], palette: { primary: "#333" } });
  assert.equal(sharp.keyboard.keyRadius, 8);
});

test("composeSkin 产出结构完整的 SkinManifest", () => {
  const spec = briefToSpec({ styleKeywords: ["清新"], palette: { primary: "#3faf7d" } });
  const skin = composeSkin(spec, { id: "t", name: "测试皮" });
  assert.equal(skin.id, "t");
  assert.equal(skin.keyboard.background.type, "gradient");
  assert.ok(skin.keyboard.key.color);
  assert.ok(skin.candidateBar.selectedFill);
});

test("QA 保证：任意主色/背景，生成皮肤的三处关键文字对比度都 ≥ 4.5", () => {
  const primaries = ["#3faf7d", "#7a5cff", "#e8843c", "#111111", "#f2f2f2", "#4a90e2", "#c0392b", "#16a085", "#9e2b25"];
  const backgrounds: (string | undefined)[] = [undefined, "#12101c", "#eef2f7", "#2b2b33"];
  for (const primary of primaries) {
    for (const background of backgrounds) {
      const brief: DesignBrief = { styleKeywords: ["测试"], palette: { primary, ...(background ? { background } : {}) } };
      const s = briefToSpec(brief);
      const kbText = contrastRatio(s.keyboard.keyFill, s.keyboard.keyText);
      const candText = contrastRatio(s.candidateBar.bg, s.candidateBar.candidate);
      const selText = contrastRatio(s.candidateBar.selectedFill, s.candidateBar.selectedText);
      const ctx = `primary=${primary} bg=${background}`;
      assert.ok(kbText >= 4.5, `按键文字对比不足(${kbText.toFixed(2)}) @ ${ctx}`);
      assert.ok(candText >= 4.5, `候选文字对比不足(${candText.toFixed(2)}) @ ${ctx}`);
      assert.ok(selText >= 4.5, `选中文字对比不足(${selText.toFixed(2)}) @ ${ctx}`);
    }
  }
});

test("generateSkin：示例简报都能生成有效皮肤", () => {
  for (const ex of EXAMPLE_BRIEFS) {
    const skin = generateSkin(ex.brief, { id: ex.id, name: ex.name });
    assert.equal(skin.id, ex.id);
    assert.ok(skin.keyboard.key.color && skin.candidateBar.candidateColor);
  }
});
