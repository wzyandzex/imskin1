import { test } from "node:test";
import assert from "node:assert/strict";

import { SeedDict, seedDict } from "../src/dict.ts";

test("种子词库非空且规模合理", () => {
  assert.ok(seedDict.size() > 80, `词条偏少：${seedDict.size()}`);
});

test("按音节键精确命中，且按频率降序", () => {
  const ni = seedDict.lookup("ni");
  assert.equal(ni[0]?.word, "你");
  // 频率单调不增
  for (let i = 1; i < ni.length; i++) {
    assert.ok(ni[i - 1].freq >= ni[i].freq);
  }
});

test("词键用 ' 连接", () => {
  assert.equal(seedDict.lookup("ni'hao")[0]?.word, "你好");
  assert.equal(seedDict.lookup("shu'ru'fa")[0]?.word, "输入法");
});

test("数据自检：混入的非汉字被剔除，不进入候选", () => {
  const d = new SeedDict({ test: "好 abc好 x1" });
  const entries = d.lookup("test");
  assert.deepEqual(entries.map((e) => e.word), ["好"]);
});

test("未命中返回空数组", () => {
  assert.deepEqual(seedDict.lookup("zzz"), []);
});
