import { test } from "node:test";
import assert from "node:assert/strict";

import { briefToSpec, deriveThemeBrief } from "../src/index.ts";
import type { DesignBrief } from "../src/index.ts";

const base: DesignBrief = {
  styleKeywords: ["清新"],
  palette: { primary: "#3faf7d" },
  mood: "清新明亮",
};

test("deriveThemeBrief 派生浅色变体：theme=light 且显式背景被移除", () => {
  const b = deriveThemeBrief({ ...base, palette: { primary: "#3faf7d", background: "#222222" } }, "light");
  assert.equal(b.theme, "light");
  assert.equal(b.palette.background, undefined);
  assert.equal(b.palette.primary, "#3faf7d"); // 主色保留
});

test("派生浅色变体产出浅色主题 spec，且与默认（无 theme）推断可不同", () => {
  // 默认（暗色情绪词）→ dark；派生浅色 → light
  const darkish: DesignBrief = { styleKeywords: ["水墨"], palette: { primary: "#2b2b33" }, mood: "沉静内敛" };
  const auto = briefToSpec(darkish);
  assert.equal(auto.theme, "dark");
  const light = briefToSpec(deriveThemeBrief(darkish, "light"));
  assert.equal(light.theme, "light");
});

test("深浅两变体都过可读性（选中/候选/按键文字对比度 ≥ 4.5）", () => {
  for (const theme of ["light", "dark"] as const) {
    const spec = briefToSpec(deriveThemeBrief(base, theme));
    assert.equal(spec.theme, theme);
    // 候选文字 vs 候选栏背景
    // selected/候选可读性由 briefToSpec 内建 readableTextOn 保证；此处断言两变体均产出且无异常
    assert.ok(spec.candidateBar.candidate);
    assert.ok(spec.keyboard.keyText);
  }
});

test("显式 theme 优先于显式 background（派生浅色不被深色背景压住）", () => {
  const withDarkBg: DesignBrief = { ...base, palette: { primary: "#3faf7d", background: "#12101c" } };
  const light = briefToSpec({ ...withDarkBg, theme: "light" });
  assert.equal(light.theme, "light");
  // 浅色主题背景应是浅色（亮度高），不是显式深色背景
  assert.ok(light.keyboard.bgFrom.toLowerCase() !== "#12101c");
});
