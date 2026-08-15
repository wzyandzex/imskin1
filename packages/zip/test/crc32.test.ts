import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import { crc32 } from "../src/index.ts";
import { utf8Encode } from "../src/bytes.ts";

test("crc32 已知向量：空串=0，\"123456789\"=0xCBF43926", () => {
  assert.equal(crc32(utf8Encode("")), 0x00000000);
  assert.equal(crc32(utf8Encode("123456789")), 0xcbf43926);
});

test("crc32 更多标准向量（含二进制字节）", () => {
  // 经 node:zlib.crc32 独立核对的权威值
  assert.equal(crc32(utf8Encode("The quick brown fox jumps over the lazy dog")), 0x414fa339);
  assert.equal(crc32(Uint8Array.of(0)), 0xd202ef8d); // 单个 0x00 字节
  assert.equal(crc32(Uint8Array.from({ length: 256 }, (_, i) => i)), 0x29058c73); // 0..255
});

test("crc32 返回无符号 32 位且确定性", () => {
  const data = utf8Encode("搜狗皮肤 .ssf");
  const a = crc32(data);
  assert.equal(a, crc32(data)); // 同输入同输出
  assert.ok(a >= 0 && a <= 0xffffffff); // 无符号，无负数（高位置位时也为正）
  assert.ok(Number.isInteger(a));
});

test("crc32 与 node:zlib.crc32 对拍（随机数据）", () => {
  for (let n = 0; n < 200; n++) {
    const len = Math.floor(Math.random() * 300);
    const data = Uint8Array.from({ length: len }, () => Math.floor(Math.random() * 256));
    assert.equal(crc32(data), zlib.crc32(data) >>> 0, `长度 ${len} 的随机数据 CRC 不一致`);
  }
});
