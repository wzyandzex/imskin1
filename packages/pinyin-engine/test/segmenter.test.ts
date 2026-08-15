import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SYLLABLES,
  isSyllable,
  isSyllablePrefix,
} from "../src/syllables.ts";
import { parse, allSegmentations, normalize } from "../src/segmenter.ts";

test("音节表规模在标准无调音节的合理范围（约 410）", () => {
  // 标准现代汉语无调音节约 410 个；允许一定弹性，主要防止漏写整组或重复膨胀。
  assert.ok(SYLLABLES.size >= 400, `音节数偏少：${SYLLABLES.size}`);
  assert.ok(SYLLABLES.size <= 430, `音节数偏多：${SYLLABLES.size}`);
});

test("代表性音节存在 / 非法串不存在", () => {
  for (const s of ["a", "ni", "hao", "zhuang", "lve", "nv", "yuan", "er", "weng"]) {
    assert.ok(isSyllable(s), `应为合法音节: ${s}`);
  }
  for (const s of ["xx", "ph", "vi", "ie", "uang", "zhuo0"]) {
    assert.ok(!isSyllable(s), `不应为合法音节: ${s}`);
  }
});

test("前缀判定：能接着敲成音节的算合法前缀", () => {
  assert.ok(isSyllablePrefix("")); // 空串
  assert.ok(isSyllablePrefix("zh")); // zh 开头一大票
  assert.ok(isSyllablePrefix("zhu"));
  assert.ok(isSyllablePrefix("ha")); // ha -> hao/han/... 合法前缀
  // isSyllablePrefix 判定的是"单个音节的前缀"；"nih" 跨了音节边界(ni + h)，故不是单音节前缀
  assert.ok(!isSyllablePrefix("nih"));
  assert.ok(!isSyllablePrefix("xq")); // 没有音节以 xq 开头
});

test("normalize：大小写、ü→v、剔除非字母（保留分隔符）", () => {
  assert.equal(normalize("NiHao"), "nihao");
  assert.equal(normalize("lü"), "lv");
  assert.equal(normalize("ni3hao!"), "nihao");
  assert.equal(normalize("xi'an"), "xi'an");
});

test("基础分词：多音节整切", () => {
  assert.deepEqual(parse("nihao").syllables, ["ni", "hao"]);
  assert.deepEqual(parse("beijing").syllables, ["bei", "jing"]);
  assert.deepEqual(parse("zhongwenshurufa").syllables, [
    "zhong", "wen", "shu", "ru", "fa",
  ]);
  assert.ok(parse("nihao").complete);
});

test("歧义切分：默认取音节数最少（最长匹配倾向）", () => {
  // "xian" 应整切为一个音节「先」，而非 xi+an
  assert.deepEqual(parse("xian").syllables, ["xian"]);
  assert.ok(parse("xian").complete);
});

test("显式分隔符强制边界：xi'an => xi + an", () => {
  const r = parse("xi'an");
  assert.deepEqual(r.syllables, ["xi", "an"]);
  assert.ok(r.complete);
});

test("增量输入：未完成的尾巴被识别为 remainder 而非报错", () => {
  const r = parse("nih"); // 已敲 ni，h 还没敲完
  assert.deepEqual(r.syllables, ["ni"]);
  assert.equal(r.remainder, "h");
  assert.equal(r.complete, false);
  assert.equal(r.valid, true);
});

test("非法输入：无法解释时 valid=false", () => {
  const r = parse("xq");
  assert.equal(r.valid, false);
});

test("allSegmentations 暴露多切分：xian 同时给出 [xian] 与 [xi,an]", () => {
  const segs = allSegmentations("xian");
  const asStr = segs.map((s) => s.join("'"));
  assert.ok(asStr.includes("xian"), `缺少整切: ${asStr}`);
  assert.ok(asStr.includes("xi'an"), `缺少分切: ${asStr}`);
});

test("ü/v 音节可切分：lvyou => lv + you（旅游）", () => {
  assert.deepEqual(parse("lvyou").syllables, ["lv", "you"]);
});
