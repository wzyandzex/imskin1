import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSsf, emitPhoneTheme, emitLayoutIni, emitColorsIni, LAYOUT_FILES } from "../src/index.ts";
import { listZip, utf8Decode } from "@imskin/zip";

function sampleProject() {
  return {
    id: "qingwa",
    name: "青瓦",
    theme: { name: "青瓦", id: "qw1", author: "IMSkin" },
    layouts: [
      { path: "default/layout/candidate.ini", content: { sections: [{ section: "CAND", entries: { HEIGHT: 96 } }] } },
      { path: "default/layout/keys.ini", content: { sections: [{ section: "KEY", entries: { FONT_SIZE: 14 } }] } },
    ],
    colors: { CAND: { COLOR: "#333333" } },
    res: [{ path: "back1.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) }],
    resblack: [{ path: "back1_black.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) }],
  };
}

test("buildSsf：合法 zip，含 phoneTheme/Skin/layout/res/resblack/colors", () => {
  const out = buildSsf(sampleProject());
  const entries = listZip(out);
  const paths = entries.map((e) => e.path);
  for (const p of [
    "phoneTheme.ini",
    "Skin.ini",
    "theme/default/layout/candidate.ini",
    "theme/default/layout/keys.ini",
    "colors.ini",
    "res/back1.png",
    "resblack/back1_black.png",
  ]) {
    assert.ok(paths.includes(p), `缺少 ${p}`);
  }
});

test("phoneTheme.ini 含主题元数据", () => {
  const text = emitPhoneTheme(sampleProject().theme);
  assert.ok(text.includes("ThemeName=青瓦"));
  assert.ok(text.includes("ThemeID=qw1"));
});

test("布局 .ini 含段与键，INI 注入被净化", () => {
  const text = emitLayoutIni({ sections: [{ section: "CAND", entries: { HEIGHT: 96 } }], extraSections: [{ section: "Ev\r\nil", entries: { "k\ny": "v\r\nw" } }] });
  const lines = text.split("\r\n");
  assert.ok(lines.includes("[CAND]"));
  assert.ok(lines.includes("HEIGHT=96"));
  assert.ok(lines.includes("[Ev  il]"));
  assert.ok(lines.includes("k y=v  w"));
});

test("colors.ini 含配色段", () => {
  const text = emitColorsIni({ CAND: { COLOR: "#333333" } });
  assert.ok(text.includes("[CAND]"));
  assert.ok(text.includes("COLOR=#333333"));
});

test("无布局/资源时仍可打包（仅 phoneTheme + Skin）", () => {
  const out = buildSsf({ id: "x", name: "极简", theme: { name: "极简" } });
  const paths = listZip(out).map((e) => e.path);
  assert.deepEqual(paths, ["phoneTheme.ini", "Skin.ini"]);
  assert.equal(LAYOUT_FILES.candidate, "candidate.ini");
});