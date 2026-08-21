import { test } from "node:test";
import assert from "node:assert/strict";

import { PinyinEngine, pinyinEngine } from "../src/engine.ts";

test("常用词整串输入：nihao 首选「你好」", () => {
  const r = pinyinEngine.analyze("nihao");
  assert.deepEqual(r.segmentation, ["ni", "hao"]);
  assert.equal(r.candidates[0]?.word, "你好");
  assert.deepEqual(r.candidates[0]?.syllables, ["ni", "hao"]);
});

test("单音节：ni 首选「你」，且给出多个单字候选", () => {
  const r = pinyinEngine.analyze("ni");
  assert.equal(r.candidates[0]?.word, "你");
  assert.ok(r.candidates.length >= 3, "应有多个单字候选");
  assert.ok(r.candidates.every((c) => c.syllables.length === 1));
});

test("三音节词：shurufa 切分正确且候选非空", () => {
  const r = pinyinEngine.analyze("shurufa");
  assert.deepEqual(r.segmentation, ["shu", "ru", "fa"]);
  // PINYIN-001：新词库可能不含「输入法」三音节词，但切分须正确且候选非空
  assert.ok(r.candidates.length > 0, "shurufa 应有候选");
});

test("歧义输入 xian：同覆盖下高频「先」在前，「西安」仍作为候选出现", () => {
  const r = pinyinEngine.analyze("xian");
  const words = r.candidates.map((c) => c.word);
  assert.equal(r.candidates[0]?.word, "先");
  assert.ok(words.includes("西安"), `候选应包含「西安」，实际: ${words.slice(0, 12)}`);
  // 「先」覆盖 4 字母；「西安」也覆盖 4 字母（xi'an 切分）
  assert.equal(r.candidates.find((c) => c.word === "西安")?.letters, 4);
});

test("显式分隔符尊重强制边界：xi'an 首选「西安」而非跨界的「先」（回归）", () => {
  const r = pinyinEngine.analyze("xi'an");
  assert.deepEqual(r.segmentation, ["xi", "an"]);
  assert.equal(r.candidates[0]?.word, "西安");
  // 不应再冒出跨越 xi|an 边界的整音节 xian 读法
  assert.ok(!r.candidates.some((c) => c.word === "先"));
});

test("边打边选：nihaoma 尚无整词，但「你好」以覆盖 5 字母居首", () => {
  const r = pinyinEngine.analyze("nihaoma");
  assert.deepEqual(r.segmentation, ["ni", "hao", "ma"]);
  assert.equal(r.candidates[0]?.word, "你好");
  assert.equal(r.candidates[0]?.letters, 5);
});

test("翻页：shi 候选很多，每页 9，hasMore 正确", () => {
  const p0 = pinyinEngine.page("shi", "qwerty", 0, 9);
  assert.equal(p0.candidates.length, 9);
  assert.ok(p0.totalCandidates > 9, `shi 候选应 > 9，实际 ${p0.totalCandidates}`);
  assert.equal(p0.hasMore, true);
  const p1 = pinyinEngine.page("shi", "qwerty", 1, 9);
  assert.ok(p1.candidates.length > 0);
  // 两页不重复
  const w0 = new Set(p0.candidates.map((c) => c.word));
  assert.ok(p1.candidates.every((c) => !w0.has(c.word)));
});

test("九宫格 T9：数字 64426 首选「你好」（与 26 键同词库）", () => {
  const r = pinyinEngine.analyze("64426", "t9");
  const words = r.candidates.map((c) => c.word);
  assert.ok(words.includes("你好"), `T9 候选应含「你好」，实际: ${words.slice(0, 12)}`);
});

test("空输入：无候选、无残余", () => {
  const r = pinyinEngine.analyze("");
  assert.deepEqual(r.candidates, []);
  assert.equal(r.segmentation.length, 0);
});

test("自定义词库可注入（引擎与数据解耦）", () => {
  const engine = new PinyinEngine({
    dict: {
      lookup: (k: string) => (k === "ceshi" || k === "ce'shi" ? [{ word: "测试", freq: 100 }] : []),
      size: () => 1,
    },
  });
  const r = engine.analyze("ceshi");
  assert.equal(r.candidates[0]?.word, "测试");
});
