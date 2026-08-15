import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyFeedback } from "../src/classify.ts";

test("asset_param 分类：字号 / 颜色深浅", () => {
  assert.equal(classifyFeedback("候选词字太小").type, "asset_param");
  assert.equal(classifyFeedback("这按键颜色太深").type, "asset_param");
  assert.equal(classifyFeedback("想换个字体").type, "asset_param");
});

test("layout 分类：位置 / 排列 / 太挤", () => {
  assert.equal(classifyFeedback("候选词应该在上面").type, "layout");
  assert.equal(classifyFeedback("按键排列太挤了").type, "layout");
});

test("style 分类：活泼→稳重 / 中国风", () => {
  assert.equal(classifyFeedback("整体太活泼了，想稳重点").type, "style");
  assert.equal(classifyFeedback("希望更有中国风").type, "style");
});

test("platform 分类：百度 / 搜狗", () => {
  const c = classifyFeedback("百度候选词对不齐，搜狗是好的");
  assert.equal(c.type, "platform");
  // 平台名进入 hints，供 routeFeedback 写明平台
  assert.ok(c.hints.includes("百度"));
  assert.ok(c.hints.includes("搜狗"));
});

test("interaction 分类：翻页 / 按压反馈", () => {
  assert.equal(classifyFeedback("候选翻页太慢").type, "interaction");
  assert.equal(classifyFeedback("按下去没反馈").type, "interaction");
});

test("兜底：无关键词命中 → style 且置信度低", () => {
  const c = classifyFeedback("我再想想吧");
  assert.equal(c.type, "style");
  assert.deepEqual(c.hints, []);
  assert.ok(c.confidence <= 0.3, `兜底置信度应低，实际 ${c.confidence}`);
});

test("命中即写入 hints；命中越多置信度越高，且均高于兜底", () => {
  const strong = classifyFeedback("候选词字太小"); // 命中"字太小""太小"
  assert.ok(strong.hints.length >= 1);
  assert.ok(strong.confidence >= 0.5);
  const weak = classifyFeedback("我再想想吧");
  assert.ok(strong.confidence > weak.confidence);
});
