/**
 * OUT-SGPC-001：搜狗 .ssf 结构校验器测试。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateSsf, buildSsf } from "@imskin/sogou-adapter";
import { zipStore, utf8Encode } from "@imskin/zip";

function minimalSsf(): Uint8Array {
  return buildSsf({
    id: "demo",
    name: "demo",
    images: [],
    ini: {
      general: { name: "demo", author: "IMSkin", version: "1.0" },
      display: { fontSize: 16, pinyinColor: "#333333", firstColor: "#1a73e8", candColor: "#222222" },
    },
  });
}

test("validateSsf：合法产物通过（入口/编码/关键节/CRC）", () => {
  const bytes = minimalSsf();
  const r = validateSsf(bytes);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.ok(r.entries.includes("skin.ini"));
});

test("validateSsf：缺 skin.ini 入口 → fail 并给出条目清单", () => {
  const bytes = zipStore([{ path: "readme.txt", data: utf8Encode("hi") }]);
  const r = validateSsf(bytes);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("缺少必需入口")));
  assert.deepEqual(r.entries, ["readme.txt"]);
});

test("validateSsf：非 zip 字节 → fail（解析错误可读）", () => {
  const r = validateSsf(new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(r.ok, false);
  assert.ok(r.issues[0].includes("zip 解析失败"));
});

test("validateSsf：路径含 .. 段 / 重复条目 → fail（路径安全）", () => {
  const bad = zipStore([
    { path: "../evil.png", data: new Uint8Array([1]) },
    { path: "skin.ini", data: new Uint8Array([2, 3]) }, // 非 UTF-16 合法 ini，但路径检查先行
    { path: "skin.ini", data: new Uint8Array([2, 3]) }, // 重复
  ]);
  const r = validateSsf(bad);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("相对段")));
  assert.ok(r.issues.some((i) => i.includes("重复条目")));
});

test("exportOutlet 附结构报告（sogou_pc）；其余出口暂无（not_run 语义）", async () => {
  const { SkinOrchestrator } = await import("../src/orchestrator.ts");
  const orch = new SkinOrchestrator();
  const p = orch.createProject("V");
  const g = orch.generate(p.id, {
    styleKeywords: ["清新"], palette: { primary: "#3faf7d" }, mood: "明亮", cornerRadius: "large",
  }, { id: "s", name: "V" });
  const sg = orch.exportOutlet(g.version.id, "sogou_pc");
  assert.ok(sg.ok);
  if (sg.ok) {
    assert.ok(sg.structuralReport);
    assert.equal(sg.structuralReport!.ok, true);
  }
  const bd = orch.exportOutlet(g.version.id, "baidu_pc");
  assert.ok(bd.ok);
  if (bd.ok) assert.equal(bd.structuralReport, undefined); // 校验器随各出口字段收口接入
});
