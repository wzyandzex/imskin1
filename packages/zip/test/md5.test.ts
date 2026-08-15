import { test } from "node:test";
import assert from "node:assert/strict";

import { md5, utf16leEncode } from "@imskin/zip";

test("md5：RFC 1321 标准测试向量", () => {
  const enc = new TextEncoder();
  assert.equal(md5(enc.encode("")), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5(enc.encode("a")), "0cc175b9c0f1b6a831c399e269772661");
  assert.equal(md5(enc.encode("abc")), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(md5(enc.encode("message digest")), "f96b697d7cb7938d525a2f31aaf161d0");
  assert.equal(md5(enc.encode("abcdefghijklmnopqrstuvwxyz")), "c3fcd3d76192e4007dfb496cca67e13b");
});

test("utf16leEncode：ASCII / BMP / 代理对字节正确", () => {
  // 'A' = U+0041 → 41 00；'中' = U+4E2D → 2D 4E
  assert.deepEqual(
    [...utf16leEncode("A中")],
    [0x41, 0x00, 0x2d, 0x4e],
  );
  // 代理对：'😀' = U+1F600 → 高低代理 3D D8 00 DE
  assert.deepEqual(
    [...utf16leEncode("\u{1F600}")],
    [0x3d, 0xd8, 0x00, 0xde],
  );
  // 空串
  assert.equal(utf16leEncode("").length, 0);
});