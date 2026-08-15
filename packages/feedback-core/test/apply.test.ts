import { test } from "node:test";
import assert from "node:assert/strict";

import { briefToSpec, lighten, darken } from "@imskin/skin-gen";
import type { DesignBrief } from "@imskin/skin-gen";

import { applyToSpec, applyToBrief, COLOR_STEP, FONT_STEP } from "../src/apply.ts";

/** 构造一个真实 VisualSpec（注意 briefToSpec 让 keyboard.font 与 candidateBar.font 共享同一对象）。 */
function sampleSpec() {
  return briefToSpec({ styleKeywords: ["清新"], palette: { primary: "#3faf7d" } });
}

test("候选词字太小 → 候选栏字号+2，其余字段深比较不变（含键盘字号不受共享引用牵连）", () => {
  const spec = sampleSpec();
  const before = structuredClone(spec);
  const after = applyToSpec(spec, "候选词字太小");

  // 入参未被修改（深拷贝语义）
  assert.deepEqual(spec, before);

  // 只有候选栏字号 +2，其余一切相同
  const expected = structuredClone(before);
  expected.candidateBar = {
    ...expected.candidateBar,
    font: { ...expected.candidateBar.font, size: before.candidateBar.font.size + FONT_STEP },
  };
  assert.deepEqual(after, expected);

  // 显式守护共享引用坑：键盘字号绝不能被连带改动
  assert.equal(after.keyboard.font.size, before.keyboard.font.size);
  assert.equal(after.candidateBar.font.size, before.candidateBar.font.size + FONT_STEP);
});

test("按键字太小 → 键盘字号+2，候选栏字号不变", () => {
  const spec = sampleSpec();
  const before = structuredClone(spec);
  const after = applyToSpec(spec, "按键字太小");

  const expected = structuredClone(before);
  expected.keyboard = {
    ...expected.keyboard,
    font: { ...expected.keyboard.font, size: before.keyboard.font.size + FONT_STEP },
  };
  assert.deepEqual(after, expected);
  assert.equal(after.candidateBar.font.size, before.candidateBar.font.size);
});

test("按键颜色太深 → keyFill 提亮一档，其余字段深比较不变", () => {
  const spec = sampleSpec();
  const before = structuredClone(spec);
  const after = applyToSpec(spec, "按键颜色太深");

  assert.deepEqual(spec, before); // 入参未改

  const expected = structuredClone(before);
  expected.keyboard = { ...expected.keyboard, keyFill: lighten(before.keyboard.keyFill, COLOR_STEP) };
  assert.deepEqual(after, expected);
  assert.notEqual(after.keyboard.keyFill, before.keyboard.keyFill); // 确实变了
});

test("按键颜色太浅/太亮 → keyFill 压暗一档", () => {
  const spec = sampleSpec();
  const before = structuredClone(spec);

  const lighter = applyToSpec(spec, "按键颜色太浅");
  assert.equal(lighter.keyboard.keyFill, darken(before.keyboard.keyFill, COLOR_STEP));

  const brighter = applyToSpec(spec, "按键太亮了");
  assert.equal(brighter.keyboard.keyFill, darken(before.keyboard.keyFill, COLOR_STEP));
});

test("applyToSpec 不修改入参（深拷贝）", () => {
  const spec = sampleSpec();
  const before = structuredClone(spec);
  applyToSpec(spec, "候选词字太小");
  applyToSpec(spec, "按键颜色太深");
  assert.deepEqual(spec, before);
});

test("applyToBrief 想稳重点 → 加入稳重、弱化活泼（styleKeywords + mood），其余不变", () => {
  const brief: DesignBrief = {
    styleKeywords: ["活泼", "清新"],
    palette: { primary: "#e8843c", accent: "#d9542b" },
    mood: "活泼 明快",
  };
  const before = structuredClone(brief);
  const next = applyToBrief(brief, "整体太活泼了，想稳重点");

  assert.deepEqual(brief, before); // 入参未改

  assert.ok(next.styleKeywords.includes("稳重"));
  assert.ok(!next.styleKeywords.includes("活泼"));
  assert.ok(next.mood!.includes("稳重"));
  assert.ok(!next.mood!.includes("活泼"));

  // 其它字段（调色板）完全不动
  assert.deepEqual(next.palette, before.palette);
});

test("applyToBrief 更有中国风 → 加入国潮/中国风关键词", () => {
  const brief: DesignBrief = { styleKeywords: ["活泼", "清新"], palette: { primary: "#9e2b25" } };
  const before = structuredClone(brief);
  const next = applyToBrief(brief, "希望更有中国风");

  assert.deepEqual(brief, before); // 入参未改
  assert.ok(next.styleKeywords.includes("国潮"));
  assert.ok(next.styleKeywords.includes("中国风"));
  // 未提及的"活泼"不应被无谓删除（最小改）
  assert.ok(next.styleKeywords.includes("活泼"));
});

test("applyToBrief 无风格信号 → 返回深拷贝且内容不变、入参不变", () => {
  const brief: DesignBrief = {
    styleKeywords: ["清新"],
    palette: { primary: "#3faf7d" },
    mood: "清新明亮",
  };
  const before = structuredClone(brief);
  const next = applyToBrief(brief, "候选词字太小"); // 资产参数类，非风格

  assert.deepEqual(next, before); // 内容不变
  assert.deepEqual(brief, before); // 入参不变
  assert.notEqual(next, brief); // 是新对象（深拷贝）
});
