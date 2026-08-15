import { test } from "node:test";
import assert from "node:assert/strict";

import { buildBds, emitInfo, emitCssIni, emitLayoutIni, applyPalette, INFO_KEYS, DIY_TYPE } from "../src/index.ts";
import { listZip, utf8Decode } from "@imskin/zip";

function sampleProject() {
  return {
    id: "heici",
    name: "黑瓷",
    info: { name: "黑瓷", author: "IMSkin", diyType: DIY_TYPE.text },
    port: [{ path: "candidate.ini", content: "[CAND]\r\nHEIGHT=96\r\n" }],
    land: [{ path: "candidate.ini", content: "[CAND]\r\nHEIGHT=80\r\n" }],
    css: { sections: { CAND: { COLOR: "#333333" }, KEY: { FONT_SIZE: 14 } } },
    images: [{ path: "res/back1.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) }],
    preview: Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
  };
}

test("buildBds：合法 zip，含 Info/Token/preview/port/land/css/素材", () => {
  const out = buildBds(sampleProject());
  const entries = listZip(out);
  const paths = entries.map((e) => e.path);
  for (const p of ["Info.txt", "Token.txt", "preview.png", "port/candidate.ini", "land/candidate.ini", "css.ini", "res/back1.png"]) {
    assert.ok(paths.includes(p), `缺少 ${p}`);
  }
});

test("Info.txt 含 DIY 皮肤键，UTF-8", () => {
  const text = emitInfo(sampleProject().info);
  assert.ok(text.includes("Name=黑瓷"));
  assert.ok(text.includes("DiyType=2"));
  assert.ok(text.includes("Style=default"));
  assert.ok(text.includes("SupportPlatform=A"));
});

test("Token.txt 为 32 位 hex MD5（非空）", () => {
  const entries = listZip(buildBds(sampleProject()));
  const token = utf8Decode(entries.find((e) => e.path === "Token.txt")!.data);
  assert.match(token.trim(), /^[0-9a-f]{32}$/);
});

test("css.ini 含 [CAND]/[KEY] 颜色与字号", () => {
  const text = emitCssIni(sampleProject().css!);
  assert.ok(text.includes("[CAND]"));
  assert.ok(text.includes("COLOR=#333333"));
  assert.ok(text.includes("[KEY]"));
  assert.ok(text.includes("FONT_SIZE=14"));
});

test("applyPalette：把皮肤配色/字号落进 css.ini 的 CAND/KEY/INPUT 段", () => {
  const css = applyPalette({ sections: {} }, { candColor: "#111111", selectedColor: "#0a64ff", composingColor: "#888888", fontSize: 16 });
  const text = emitCssIni(css);
  assert.ok(text.includes("[CAND]"));
  assert.ok(text.includes("COLOR=#111111"));
  assert.ok(text.includes("HL_COLOR=#0a64ff"));
  assert.ok(text.includes("[INPUT]"));
  assert.ok(text.includes("COLOR=#888888"));
  assert.ok(text.includes("[KEY]"));
  assert.ok(text.includes("FONT_SIZE=16"));
});

test("emitLayoutIni：段 + 逃生舱 + INI 注入防御", () => {
  const text = emitLayoutIni({
    sections: [{ section: "CAND", entries: { HEIGHT: 96 } }],
    extraSections: [{ section: "Ev\r\nil", entries: { "k\ny": "v\r\nw" } }],
  });
  const lines = text.split("\r\n");
  assert.ok(lines.includes("[CAND]"));
  assert.ok(lines.includes("HEIGHT=96"));
  assert.ok(lines.includes("[Ev  il]"), "节名内换行被净化");
  assert.ok(lines.includes("k y=v  w"), "键/值内换行被净化");
});

test("无 port/land/css 时仍可打包（仅 Info/Token）", () => {
  const out = buildBds({ id: "x", name: "极简", info: { name: "极简" } });
  const paths = listZip(out).map((e) => e.path);
  assert.deepEqual(paths, ["Info.txt", "Token.txt"]);
  assert.equal(INFO_KEYS.diyType, "DiyType");
});