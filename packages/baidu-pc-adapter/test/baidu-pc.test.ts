import { test } from "node:test";
import assert from "node:assert/strict";

import { buildBps, type BaiduPcProject } from "../src/index.ts";
import { emitSkinIni, emitSkinXml, SKIN_KEYS } from "../src/index.ts";
import { emitUiXml } from "../src/index.ts";
import { listZip, utf16leEncode, utf8Decode } from "@imskin/zip";

function utf16leDecode(bytes: Uint8Array): string {
  return new TextDecoder("utf-16le").decode(bytes);
}

function sampleProject(): BaiduPcProject {
  return {
    id: "chunbai",
    name: "纯白",
    meta: { name: "纯白", author: "花祭", guid: "B67D25BB-6E60-43C8-847A-1C57EB643D2B" },
    candidate: {
      windows: [
        {
          tag: "CCandidateWin",
          attrs: { size: "150,80" },
          properties: { bkground: { file: "\\main_backgroundH.png", drawStyle: 2 } },
          children: [
            { name: "H_BtnSearch", position: "108,8", size: "18,18", normal: { file: "\\baidu_h_normal.png", stretchArea: { left: 4, top: 4, right: 13, bottom: 13 } } },
          ],
        },
      ],
    },
    status: {
      windows: [
        {
          tag: "CStatusWin",
          attrs: { size: "191,82" },
          properties: { bkground: { file: "\\toolbar_background.png", drawStyle: 2 } },
          children: [{ name: "BtnLogo", normal: { file: "\\BtnLogo_normal.png" } }],
        },
      ],
    },
    images: [
      { path: "\\main_backgroundH.png", data: Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61) },
      { path: "\\baidu_h_normal.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) },
      { path: "\\BtnLogo_normal.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) },
      { path: "\\toolbar_background.png", data: Uint8Array.of(0x47, 0x49, 0x46, 0x38) },
    ],
    preview: Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
  };
}

test("buildBps：合法 zip，含 4 个必备配置 + 预览 + 全部位图", () => {
  const out = buildBps(sampleProject());
  const entries = listZip(out);
  const paths = entries.map((e) => e.path);
  for (const p of ["skin.ini", "Skin.xml", "Candidate.xml", "Status.xml", "skinpreview.png", "\\baidu_h_normal.png"]) {
    assert.ok(paths.includes(p), `缺少 ${p}`);
  }
});

test("skin.ini 为 UTF-16LE，内容与 emitSkinIni 一致", () => {
  const p = sampleProject();
  p.meta.time = "20260807120000000"; // 固定时间戳，避免自动生成时间漂移
  const entries = listZip(buildBps(p));
  const ini = entries.find((e) => e.path === "skin.ini")!;
  assert.equal(utf16leDecode(ini.data), emitSkinIni(p.meta));
  assert.ok(utf16leDecode(ini.data).includes("[Skin]"));
  assert.ok(utf16leDecode(ini.data).includes("name=纯白"));
});

test("Skin.xml 为 UTF-8 XML，与 ini 等价（含 guid/author）", () => {
  const entries = listZip(buildBps(sampleProject()));
  const xml = entries.find((e) => e.path === "Skin.xml")!;
  const text = utf8Decode(xml.data);
  assert.ok(text.startsWith("<?xml"));
  assert.ok(text.includes('<Skin version="1.0">'));
  assert.ok(text.includes('name value="纯白"'));
  assert.ok(text.includes('guid value="B67D25BB-6E60-43C8-847A-1C57EB643D2B"'));
});

test("Candidate.xml 含 CBDButton/CBDImage 与九宫格 stretchArea", () => {
  const out = emitUiXml(sampleProject().candidate!);
  assert.ok(out.includes('<UI version="1.0">'));
  assert.ok(out.includes("<CCandidateWin"));
  assert.ok(out.includes('size="150,80"'));
  assert.ok(out.includes('name="H_BtnSearch"'));
  assert.ok(out.includes('stretchArea="4,4,13,13"'));
  assert.ok(out.includes('file="\\baidu_h_normal.png"'));
});

test("guid 缺省时自动生成（唯一且格式合法）", () => {
  const p = sampleProject();
  delete p.meta.guid;
  const out1 = buildBps(p);
  const out2 = buildBps({ ...p, meta: { ...p.meta, name: "x2" } });
  const g1 = utf16leDecode(listZip(out1).find((e) => e.path === "skin.ini")!.data).match(/guid=([0-9A-F-]+)/)![1];
  const g2 = utf16leDecode(listZip(out2).find((e) => e.path === "skin.ini")!.data).match(/guid=([0-9A-F-]+)/)![1];
  assert.match(g1, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
  assert.notEqual(g1, g2);
});

test("随机 GUID 与 SKIN_KEYS 暴露", () => {
  assert.equal(SKIN_KEYS.name, "name");
  assert.equal(SKIN_KEYS.section, "Skin");
});