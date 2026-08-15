import { test } from "node:test";
import assert from "node:assert/strict";

import { zipStore, listZip, type ZipEntry } from "../src/index.ts";
import { crc32 } from "../src/index.ts";
import { utf8Encode } from "../src/index.ts";

// 覆盖全字节值域的二进制数据（0..255 各一份），用于验证 store 不改动任何字节。
const binary256 = Uint8Array.from({ length: 256 }, (_, i) => i);

test("zipStore→listZip round-trip：路径与字节完全一致（含二进制/非 ASCII 项）", () => {
  const files: ZipEntry[] = [
    { path: "skin.ini", data: utf8Encode("[General]\r\nSkinName=测试\r\n") },
    { path: "image/背景.png", data: binary256 }, // 非 ASCII 路径 + 全值域二进制数据
    { path: "empty.dat", data: new Uint8Array(0) }, // 空文件边界
    { path: "apng/帧序列.apng", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x7f, 0x80) },
  ];

  const zip = zipStore(files);
  const out = listZip(zip);

  assert.equal(out.length, files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(out[i].path, files[i].path, `第 ${i} 项路径不一致`);
    assert.deepEqual(out[i].data, files[i].data, `第 ${i} 项字节不一致`);
  }
});

test("zip 产物带合法签名（本地文件头 PK\\x03\\x04、EOCD PK\\x05\\x06）", () => {
  const zip = zipStore([{ path: "a.txt", data: utf8Encode("hi") }]);
  // 起始为本地文件头签名
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  // 末尾 22 字节为 EOCD，签名在其起始
  const eocd = zip.slice(zip.length - 22);
  assert.deepEqual([...eocd.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
});

test("空 zip（无条目）可被解析为空列表", () => {
  const out = listZip(zipStore([]));
  assert.deepEqual(out, []);
});

test("listZip 校验 CRC：篡改数据字节后抛错", () => {
  const zip = zipStore([{ path: "a", data: utf8Encode("payload") }]);
  // 单条目：本地头 30 字节 + 文件名 "a"(1) → 数据起点在偏移 31
  const tampered = zip.slice();
  tampered[31] ^= 0xff;
  assert.throws(() => listZip(tampered), /CRC-32 校验失败/);
});

test("listZip 拒绝非 zip 输入", () => {
  assert.throws(() => listZip(new Uint8Array(10)), /长度不足/); // 短于 EOCD
  assert.throws(() => listZip(Uint8Array.from({ length: 40 }, () => 0xaa)), /未找到 EOCD/);
});

test("zipStore 写入的 CRC 与 crc32(data) 一致（抽查本地文件头）", () => {
  const data = binary256;
  const zip = zipStore([{ path: "b", data }]);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const crcInHeader = dv.getUint32(14, true) >>> 0; // 本地文件头 crc-32 字段偏移 14
  assert.equal(crcInHeader, crc32(data));
});
