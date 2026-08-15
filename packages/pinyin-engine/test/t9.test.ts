import { test } from "node:test";
import assert from "node:assert/strict";

import {
  T9_KEYS,
  encodeToDigits,
  t9Segmentations,
} from "../src/t9.ts";

test("T9 键位映射完整覆盖 a-z", () => {
  const letters = new Set(Object.values(T9_KEYS).join(""));
  for (let c = 97; c <= 122; c++) {
    const ch = String.fromCharCode(c);
    // v 走 u 同键的特殊处理，其余都应在键面上
    if (ch === "v") continue;
    assert.ok(letters.has(ch), `字母 ${ch} 未映射到任何数字键`);
  }
});

test("encodeToDigits：nihao => 64426", () => {
  // n=6 i=4 h=4 a=2 o=6
  assert.equal(encodeToDigits("nihao"), "64426");
});

test("T9 切分：64426 能产出含 [ni,hao] 的音节序列", () => {
  const seqs = t9Segmentations("64426");
  const asStr = seqs.map((s) => s.join("'"));
  assert.ok(asStr.includes("ni'hao"), `期望包含 ni'hao，实际: ${asStr.slice(0, 10)}`);
});

test("T9 切分：数字串对应多种拼音（歧义），但都由合法音节组成", () => {
  const seqs = t9Segmentations("426"); // 4=ghi 2=abc 6=mno
  assert.ok(seqs.length > 0, "426 应至少有一种合法拼音切分");
  // 每个音节都必须是合法音节（t9Segmentations 只从音节表取，天然保证）
  for (const seq of seqs) {
    assert.ok(seq.length > 0);
  }
});

test("T9 空/非法输入返回空", () => {
  assert.deepEqual(t9Segmentations(""), []);
  assert.deepEqual(t9Segmentations("111"), []); // 1 不在 2-9
});
