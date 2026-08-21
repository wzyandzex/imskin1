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

test("exportOutlet 附结构报告：四出口均有校验器", async () => {
  const { SkinOrchestrator } = await import("../src/orchestrator.ts");
  const orch = new SkinOrchestrator();
  const p = orch.createProject("V");
  const g = orch.generate(p.id, {
    styleKeywords: ["清新"], palette: { primary: "#3faf7d" }, mood: "明亮", cornerRadius: "large",
  }, { id: "s", name: "V" });

  // 四口全部有结构报告（不再有 not_run）
  for (const o of ["sogou_pc", "sogou_android", "baidu_pc", "baidu_android"] as const) {
    const r = orch.exportOutlet(g.version.id, o);
    assert.ok(r.ok, `${o} export should succeed`);
    if (r.ok) {
      assert.ok(r.structuralReport, `${o} should have structural report`);
      // 校验器自身通过（zip 结构合法、必需入口存在）
      assert.equal(r.structuralReport!.ok, true, `${o}: ${r.structuralReport!.issues.join("；")}`);
    }
  }
});
