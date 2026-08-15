import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeIntent, refineBrief, finalizeBrief } from "../src/intent.ts";

test("完整想法（风格+颜色+情绪）→ 不触发追问", () => {
  const r = analyzeIntent("国潮水墨风格，主色墨黑 #2b2b33，情绪沉静内敛");
  assert.equal(r.needsClarification, false);
  assert.equal(r.question, undefined);
  // 颜色被正确提取
  assert.equal(r.brief.palette.primary, "#2b2b33");
  // 风格关键词含"国潮/水墨"
  assert.ok(r.brief.styleKeywords.some((k) => /国潮|水墨/.test(k)));
  // 情绪为显式
  assert.equal(r.brief.mood, "沉静内敛");
});

test("模糊想法（只说一个风格词）→ 触发一次追问，且只问一个最关键维度", () => {
  const r = analyzeIntent("想要一个好看的皮肤");
  // 没有明确颜色、没有明确情绪、风格也只是泛词"好看"（不在风格词表）→ 缺≥2 → 追问
  assert.equal(r.needsClarification, true);
  assert.ok(r.question);
  // 只问一个问题
  assert.equal(typeof r.question!.text, "string");
  // 优先问风格
  assert.equal(r.question!.field, "styleKeywords");
  assert.ok(r.question!.options.length > 0);
});

test("只说风格 → 颜色与情绪均缺 → 至少缺两个明确指向（触发追问或不追问均给合理默认）", () => {
  const r = analyzeIntent("水墨");
  // 水墨：风格明确；颜色无显式（推断墨黑）；情绪可推断（沉静内敛）。
  // 颜色与情绪都算"缺明确指向" → missing>=2 → 触发追问；但即使追问也只问一个。
  if (r.needsClarification) {
    assert.ok(r.question);
    assert.ok(["palette", "mood", "styleKeywords"].includes(r.question!.field));
  }
  // 无论是否追问，颜色与情绪都给了合理默认
  assert.ok(r.brief.palette.primary);
  assert.ok(r.brief.mood);
});

test("风格+情绪明确、只缺颜色 → 不追问（缺 1 < 2）", () => {
  const r = analyzeIntent("极简风格，情绪沉静内敛");
  assert.equal(r.needsClarification, false);
});

test("推断默认值被标注为 inferredFields", () => {
  // "好看的皮肤"：无风格词、无颜色词、无情绪词 → 风格/颜色/情绪均推断
  const r = analyzeIntent("想要一个好看的皮肤");
  assert.ok(r.inferredFields.includes("palette.primary"));
  assert.ok(r.inferredFields.includes("styleKeywords"));
  assert.ok(r.inferredFields.includes("mood"));
  assert.ok(r.inferredFields.includes("cornerRadius"));
  assert.ok(r.inferredFields.includes("materialDirection"));
});

test("颜色词映射：中文颜色词 → hex", () => {
  assert.equal(analyzeIntent("薄荷绿键盘").brief.palette.primary, "#3faf8d");
  assert.equal(analyzeIntent("朱红点缀").brief.palette.primary, "#c0392b");
});

test("refineBrief 应用追问回答后该字段转为明确", () => {
  const r = analyzeIntent("想要一个好看的皮肤");
  assert.equal(r.needsClarification, true);
  const brief2 = refineBrief(r.brief, "styleKeywords", "国潮 水墨");
  assert.ok(brief2.styleKeywords.includes("国潮"));
  assert.ok(brief2.styleKeywords.includes("水墨"));
});

test("refineBrief 配色回答支持中文颜色词", () => {
  const base = analyzeIntent("极简").brief;
  const brief2 = refineBrief(base, "palette", "天蓝");
  assert.equal(brief2.palette.primary, "#5ab0f0");
});

test("finalizeBrief 把推断标注写进简报（inferredFields）", () => {
  const r = analyzeIntent("水墨");
  const final = finalizeBrief(r.brief, r.inferredFields);
  assert.deepEqual(final.inferredFields, r.inferredFields);
  assert.ok(final.inferredFields!.length > 0);
});

test("空输入/空白输入给合理默认且不崩溃", () => {
  const r = analyzeIntent("   ");
  assert.ok(r.brief.palette.primary);
  assert.ok(r.brief.styleKeywords.length > 0);
});
