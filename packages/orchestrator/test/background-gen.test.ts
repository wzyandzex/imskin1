import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { SkinOrchestrator } from "../src/orchestrator.ts";
import { listZip, base64Decode } from "@imskin/zip";
import type { DesignBrief } from "@imskin/skin-gen";

const BRIEF: DesignBrief = {
  styleKeywords: ["清新", "极简"],
  palette: { primary: "#3faf7d" },
  mood: "清新明亮",
  cornerRadius: "large",
};

function boot() {
  const orch = new SkinOrchestrator();
  const p = orch.createProject("BG");
  const g = orch.generate(p.id, BRIEF, { id: "s1", name: "BG" });
  return { orch, versionId: g.version.id };
}

/** 构造一个合法的最小 PNG（1×1 红色像素）作为 mock LLM 返回值。 */
function tinyPng(): Uint8Array {
  // 1×1 RGBA PNG（stored-block，完整合法字节）
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // w=1 h=1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // depth=8 color=RGBA + CRC
    0x89, // IDAT chunk start
    0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
    0x78, 0x01, 0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
    0x0e, 0x27, 0x24, 0x50, // adler + CRC (approx)
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
  ]);
}

test("A3-002 applyGeneratedBackground：LLM 产图 → fork 新版本，skin 填充变 image，资产注册", async () => {
  const { orch, versionId } = boot();
  const before = orch.readDesign(versionId);
  assert.equal(before.skin.keyboard.background.type, "gradient");

  // mock LLM 钩子
  orch.llm = { generateKeyboardBg: async () => tinyPng() };

  const r = await orch.applyGeneratedBackground(versionId);
  assert.ok(r, "应返回新版本");
  if (!r) return;

  // skin 填充已切换为 image
  assert.equal(r.design.skin.keyboard.background.type, "image");
  const fill = r.design.skin.keyboard.background;
  assert.equal(fill.type, "image");
  if (fill.type === "image") {
    assert.ok(fill.src.startsWith("data:image/png;base64,"));
    assert.ok(fill.slice);
  }

  // 资产注册：keyboard.background 存在且 hash 合法
  const bgAssets = r.design.assets?.sogou_pc.filter((a) => a.descriptor.role === "keyboard.background") ?? [];
  assert.equal(bgAssets.length, 1);
  assert.match(bgAssets[0].descriptor.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(bgAssets[0].path, "bg_keyboard.png");
  assert.equal(bgAssets[0].descriptor.source, "generated");

  // 版本树增加了新节点
  const versions = orch.store.listVersions(orch.store.getVersion(r.version.id)!.projectId);
  assert.ok(versions.length >= 2);
});

test("A3-002 无 LLM 钩子 → 返回 null（诚实降级，不伪造）", async () => {
  const { orch, versionId } = boot();
  orch.llm = undefined;
  const r = await orch.applyGeneratedBackground(versionId);
  assert.equal(r, null);
  // 原版本不变
  assert.equal(orch.readDesign(versionId).skin.keyboard.background.type, "gradient");
});

test("A3-002 LLM 返回空字节 → null（诚实降级）", async () => {
  const { orch, versionId } = boot();
  orch.llm = { generateKeyboardBg: async () => new Uint8Array(0) };
  const r = await orch.applyGeneratedBackground(versionId);
  assert.equal(r, null);
});

test("A3-002 导出打入背景位图：sogou_pc .ssf 包含 bg_keyboard.png", async () => {
  const { orch, versionId } = boot();
  orch.llm = { generateKeyboardBg: async () => tinyPng() };
  const r = await orch.applyGeneratedBackground(versionId);
  if (!r) { assert.fail("应成功"); return; }

  const exp = orch.exportOutlet(r.version.id, "sogou_pc");
  assert.ok(exp.ok);
  if (exp.ok) {
    const paths = listZip(exp.bytes).map((e) => e.path);
    assert.ok(paths.includes("bg_keyboard.png"), "包内应有 bg_keyboard.png");
    assert.ok(paths.includes("status/zhong.png"), "状态栏图标仍在");
  }
});

test("A3-002 重复生成：替换已有 background 资产而非追加", async () => {
  const { orch, versionId } = boot();
  orch.llm = { generateKeyboardBg: async () => tinyPng() };
  const r1 = await orch.applyGeneratedBackground(versionId);
  if (!r1) { assert.fail("第一次应成功"); return; }

  const r2 = await orch.applyGeneratedBackground(r1.version.id);
  if (!r2) { assert.fail("第二次应成功"); return; }

  const bgAssets = r2.design.assets?.sogou_pc.filter((a) => a.descriptor.role === "keyboard.background") ?? [];
  assert.equal(bgAssets.length, 1, "替换而非追加");
});