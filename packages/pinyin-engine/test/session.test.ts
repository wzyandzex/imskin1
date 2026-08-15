import { test } from "node:test";
import assert from "node:assert/strict";

import { InputSession } from "../src/session.ts";

test("整词输入并上屏：nihao → 选首选 → 「你好」，缓冲清空", () => {
  const s = new InputSession();
  for (const ch of "nihao") s.input(ch);
  assert.equal(s.view().candidates[0]?.word, "你好");
  s.selectCandidate(0);
  const v = s.view();
  assert.equal(v.committedText, "你好");
  assert.equal(v.buffer, "");
  assert.equal(v.composingActive, false);
});

test("边打边选：nihaoma → 选「你好」消耗 5 字母 → 缓冲剩 ma → 再选「吗」", () => {
  const s = new InputSession();
  for (const ch of "nihaoma") s.input(ch);
  s.selectCandidate(0); // 你好
  assert.equal(s.view().buffer, "ma");
  assert.equal(s.view().committedText, "你好");
  const maIdx = s.view().candidates.findIndex((c) => c.word === "吗");
  assert.ok(maIdx >= 0, "应能打出「吗」");
  s.selectCandidate(maIdx);
  assert.equal(s.view().committedText, "你好吗");
  assert.equal(s.view().buffer, "");
});

test("commit：有候选上首选", () => {
  const s = new InputSession();
  for (const ch of "wo") s.input(ch);
  s.commit();
  assert.equal(s.view().committedText, "我");
});

test("英文直通：无候选时 commit 原样上屏", () => {
  const s = new InputSession();
  for (const ch of "q") s.input(ch); // q 是合法前缀但无整词候选
  assert.equal(s.view().candidates.length, 0);
  s.commit();
  assert.equal(s.view().committedText, "q");
});

test("退格：先删缓冲，缓冲空后删已上屏字符", () => {
  const s = new InputSession();
  for (const ch of "nihao") s.input(ch);
  s.backspace();
  assert.equal(s.view().buffer, "niha");
  s.clearComposing();
  for (const ch of "wo") s.input(ch);
  s.commit(); // 上屏 我
  assert.equal(s.view().committedText, "我");
  s.backspace(); // 缓冲空 → 删「我」
  assert.equal(s.view().committedText, "");
});

test("空格：空闲输入空格；组合中上屏首选", () => {
  const s = new InputSession();
  s.space();
  assert.equal(s.view().committedText, " ");
  for (const ch of "ni") s.input(ch);
  s.space();
  assert.equal(s.view().committedText, " 你");
});

test("翻页：shi 多候选，翻到第 2 页选词命中正确的全局候选", () => {
  const s = new InputSession();
  for (const ch of "shi") s.input(ch);
  const page0 = s.view().candidates.map((c) => c.word);
  s.pageDown();
  const page1 = s.view().candidates.map((c) => c.word);
  assert.ok(page1.length > 0);
  assert.ok(page1.every((w) => !page0.includes(w)), "翻页不应重复候选");
  const firstOfPage1 = page1[0];
  s.selectCandidate(0);
  assert.equal(s.view().committedText, firstOfPage1);
});

test("切换到九宫格会清空缓冲，且能用数字打出「你好」", () => {
  const s = new InputSession();
  for (const ch of "nihao") s.input(ch);
  s.switchMode("t9");
  assert.equal(s.view().buffer, "");
  assert.equal(s.mode, "t9");
  for (const ch of "64426") s.input(ch);
  const idx = s.view().candidates.findIndex((c) => c.word === "你好");
  assert.ok(idx >= 0, "九宫格应能打出「你好」");
  s.selectCandidate(idx);
  assert.equal(s.view().committedText, "你好");
});

test("输入过滤：大写转小写；组合中非法字符被忽略", () => {
  const s = new InputSession();
  s.input("N");
  s.input("I");
  assert.equal(s.view().buffer, "ni");
  s.input("1"); // 26 键下 1 非法且在组合中 → 忽略
  assert.equal(s.view().buffer, "ni");
  // 九宫格下字母非法
  const t = new InputSession({ mode: "t9" });
  t.input("6");
  t.input("a"); // 忽略
  assert.equal(t.view().buffer, "6");
});

test("reset 清空一切", () => {
  const s = new InputSession();
  for (const ch of "ni") s.input(ch);
  s.commit();
  s.reset();
  const v = s.view();
  assert.equal(v.committedText, "");
  assert.equal(v.buffer, "");
});

test("commitRaw：回车把原始拼音字母当文本上屏，不选候选", () => {
  const s = new InputSession();
  for (const ch of "nihao") s.input(ch);
  s.commitRaw();
  assert.equal(s.view().committedText, "nihao");
  assert.equal(s.view().buffer, "");
});

test("insertText：组合中插标点会先上屏首选再追加", () => {
  const s = new InputSession();
  for (const ch of "ni") s.input(ch);
  s.insertText("，");
  assert.equal(s.view().committedText, "你，");
  assert.equal(s.view().buffer, "");
  // 空闲直接追加
  s.insertText("!");
  assert.equal(s.view().committedText, "你，!");
});

test("insertText：多音节组合插标点，标点落在整段词之后而非夹在中间（回归）", () => {
  const s = new InputSession();
  for (const ch of "nihaoma") s.input(ch);
  s.insertText("，"); // 应逐次上屏「你好」「吗」后再追加逗号
  assert.equal(s.view().committedText, "你好吗，");
  assert.equal(s.view().buffer, "");
});
