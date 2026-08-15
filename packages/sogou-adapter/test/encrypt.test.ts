import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEncryptedSsf, parseEncryptedSsf } from "../src/encrypt.ts";

test("buildEncryptedSsf → parseEncryptedSsf round-trip：文件字节级一致", () => {
  const files = [
    { path: "skin.ini", data: new TextEncoder().encode("[General]\r\nskin_name=青花瓷\r\n") },
    { path: "bg_h.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
    { path: "status/中文.png", data: Uint8Array.from({ length: 64 }, (_, i) => (i * 5) & 0xff) },
  ];
  const ssf = buildEncryptedSsf(files);
  const parsed = parseEncryptedSsf(ssf);

  assert.equal(parsed.length, files.length);
  for (const f of files) {
    const got = parsed.find((p) => p.path === f.path);
    assert.ok(got, `缺少 ${f.path}`);
    assert.deepEqual(got!.data, f.data, `${f.path} 字节不一致`);
  }
});

test("加密 .ssf 头 8 字节为 Skin 魔数 + 版本 3", () => {
  const ssf = buildEncryptedSsf([{ path: "skin.ini", data: new Uint8Array([0x3b]) }]);
  // "Skin" = 53 6B 69 6E；版本 3 = 03 00 00 00
  assert.deepEqual([...ssf.subarray(0, 8)], [0x53, 0x6b, 0x69, 0x6e, 0x03, 0x00, 0x00, 0x00]);
});

test("非加密数据解析 → 明确报错", () => {
  assert.throws(() => parseEncryptedSsf(new Uint8Array([1, 2, 3, 4])), /Skin 魔数/);
});