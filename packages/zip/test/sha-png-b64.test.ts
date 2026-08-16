/**
 * sha256 / pngEncode / base64 测试（含用 node:zlib 独立验证 PNG 合法性）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";

import { sha256, pngEncode, base64Encode, base64Decode } from "../src/index.ts";

test("sha256：FIPS 180-4 已知向量（空/abc/长输入）", () => {
  assert.equal(sha256(new Uint8Array(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const long = new TextEncoder().encode("a".repeat(1000));
  assert.match(sha256(long), /^[0-9a-f]{64}$/);
  // 与 node:crypto 对拍
  assert.equal(sha256(long), createHash("sha256").update(long).digest("hex"));
});

test("pngEncode：结构合法（签名/IHDR/IDAT 可被 node:zlib 解开，像素往返一致）", () => {
  const w = 5;
  const h = 3;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37) & 0xff;
  const png = pngEncode(w, h, px);

  // 签名
  assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  assert.equal(dv.getUint32(16), w);
  assert.equal(dv.getUint32(20), h);
  assert.equal(png[24], 8); // depth
  assert.equal(png[25], 6); // RGBA

  // IDAT：手工定位（sig8 + IHDR chunk 25）后，zlib 流可被标准实现解开
  const idatLen = dv.getUint32(33);
  const idat = png.subarray(41, 41 + idatLen);
  const raw = inflateSync(idat); // node:zlib 验证 stored-deflate + adler 合法
  assert.equal(raw.length, h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (1 + w * 4)], 0); // filter=0
    assert.deepEqual([...raw.subarray(y * (1 + w * 4) + 1, (y + 1) * (1 + w * 4))], [...px.subarray(y * w * 4, (y + 1) * w * 4)]);
  }
  // IEND 收尾（最后 12 字节：长度0 + "IEND" + CRC）
  assert.equal(png[png.length - 8], 0x49); // 'I'
  assert.equal(png[png.length - 7], 0x45); // 'E'
  assert.equal(png[png.length - 6], 0x4e); // 'N'
  assert.equal(png[png.length - 5], 0x44); // 'D'
});

test("base64：与 Buffer 对拍 + round-trip（含 padding 边界）", () => {
  for (const n of [0, 1, 2, 3, 4, 255]) {
    const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 71) & 0xff));
    assert.equal(base64Encode(bytes), Buffer.from(bytes).toString("base64"));
    assert.deepEqual([...base64Decode(base64Encode(bytes))], [...bytes]);
  }
  assert.throws(() => base64Decode("ab!c"), /非法字符/);
});
