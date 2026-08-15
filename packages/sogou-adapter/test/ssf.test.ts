import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSsf, type SogouSkinProject } from "../src/ssf.ts";
import { emitSkinIni } from "../src/skin-ini.ts";
import { listZip, utf16leEncode } from "@imskin/zip";

/** 解码 UTF-16LE 字节为字符串（无 BOM）。 */
function utf16leDecode(bytes: Uint8Array): string {
  return new TextDecoder("utf-16le").decode(bytes);
}

function sampleProject(): SogouSkinProject {
  return {
    id: "qinghua",
    name: "青花瓷",
    images: [
      { path: "bg_h.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) }, // PNG 魔数
      { path: "bg_v.png", data: Uint8Array.from({ length: 128 }, (_, i) => (i * 7) & 0xff) },
      { path: "status/中文.png", data: Uint8Array.of(0xff, 0x00, 0x80, 0x7f) }, // 非 ASCII 路径 + 二进制
    ],
    ini: {
      general: { name: "青花瓷", author: "IMSkin", version: "1.0" },
      display: {
        fontSize: 14,
        pinyinColor: "#333333",
        firstColor: "#1a73e8",
        candColor: "#222222",
      },
      horizontalWindow: { image: "bg_h.png", top: 6, right: 6, bottom: 6, left: 6 },
    },
  };
}

test("buildSsf 产物可被 listZip 列出 skin.ini，内容与 emitSkinIni 一致", () => {
  const project = sampleProject();
  const ssf = buildSsf(project);
  const entries = listZip(ssf); // 不抛 = CRC/结构合法

  const ini = entries.find((e) => e.path === "skin.ini");
  assert.ok(ini, "产物应包含 skin.ini");
  assert.equal(utf16leDecode(ini.data), emitSkinIni(project.ini));
});

test("buildSsf 包含全部 images（路径与字节完全一致）", () => {
  const project = sampleProject();
  const entries = listZip(buildSsf(project));

  for (const img of project.images) {
    const got = entries.find((e) => e.path === img.path);
    assert.ok(got, `产物缺少图片 ${img.path}`);
    assert.deepEqual(got.data, img.data, `图片 ${img.path} 字节不一致`);
  }
  // skin.ini + 全部图片
  assert.equal(entries.length, project.images.length + 1);
});

test("buildSsf：skin.ini 位于包内首位", () => {
  const entries = listZip(buildSsf(sampleProject()));
  assert.equal(entries[0].path, "skin.ini");
});

test("buildSsf round-trip：skin.ini 字节等于 utf16le(emitSkinIni)", () => {
  const project = sampleProject();
  const entries = listZip(buildSsf(project));
  const ini = entries.find((e) => e.path === "skin.ini");
  assert.ok(ini);
  assert.deepEqual(ini.data, utf16leEncode(emitSkinIni(project.ini)));
});

test("buildSsf：skin.ini 为 UTF-16LE 编码（逆向确证，缺 BOM）", () => {
  const entries = listZip(buildSsf(sampleProject()));
  const ini = entries.find((e) => e.path === "skin.ini")!;
  // 首字节非 UTF-8 的 ASCII 表示（'s'=0x73 会以 73 00 出现），且以 UTF-16LE 可完整解码
  assert.equal(ini.data[0], 0x3b /* ';' UTF-16LE 低字节 */);
  assert.equal(ini.data[1], 0x00);
  const text = utf16leDecode(ini.data);
  assert.ok(text.startsWith(";"));
  assert.ok(text.includes("[General]"));
});
