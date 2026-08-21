import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { SkinOrchestrator } from "../src/orchestrator.ts";
import { OUTLETS } from "@imskin/contracts";
import type { DesignBrief } from "@imskin/skin-gen";

const BRIEF: DesignBrief = {
  styleKeywords: ["清新", "极简"],
  palette: { primary: "#3faf7d" },
  mood: "清新明亮",
  cornerRadius: "large",
};

function boot(): { orch: SkinOrchestrator; versionId: string } {
  const orch = new SkinOrchestrator();
  const p = orch.createProject("J");
  const g = orch.generate(p.id, BRIEF, { id: "s1", name: "J" });
  return { orch, versionId: g.version.id };
}

test("JOB-001 exportOutlet：四出口各自成功返回字节与出口标识", () => {
  const { orch, versionId } = boot();
  for (const o of OUTLETS) {
    const r = orch.exportOutlet(versionId, o);
    assert.equal(r.ok, true, `${o} 应成功`);
    if (r.ok) {
      assert.equal(r.outlet, o);
      assert.ok(r.bytes.length > 0, `${o} 字节非空`);
    }
  }
});

test("JOB-001 失败隔离：单出口构建抛错 → 仅该出口 failed 带 Diagnostic，其余不受影响", () => {
  const { orch, versionId } = boot();
  // 仅让搜狗 Android 分支抛错（exportOutlet 委托单出口方法，可按出口替身）
  const spy = mock.method(SkinOrchestrator.prototype, "exportSogouMobile", function (this: SkinOrchestrator) {
    throw new Error("layout ini build crashed");
  });
  try {
    const results = OUTLETS.map((o) => orch.exportOutlet(versionId, o));
    const failed = results.filter((r) => !r.ok);
    assert.equal(failed.length, 1);
    const f = failed[0];
    assert.equal(f.ok, false);
    if (!f.ok) {
      assert.equal(f.outlet, "sogou_android");
      assert.equal(f.diagnostic.code, "OUTLET_BUILD_FAILED");
      assert.equal(f.diagnostic.severity, "error");
      assert.equal(f.diagnostic.retryable, true);
      assert.ok(f.diagnostic.userMessage.length > 0);
      assert.match(f.diagnostic.technicalMessage, /layout ini build crashed/);
      assert.deepEqual(f.diagnostic.outlets, ["sogou_android"]);
    }
    // 其余三口仍成功
    for (const r of results) {
      if (r.outlet !== "sogou_android") assert.equal(r.ok, true, `${r.outlet} 不应被牵连`);
    }
  } finally {
    spy.mock.restore();
  }
});

test("JOB-001 skin 覆盖：exportOutlet 接受深浅变体皮肤（FR-QA-3 所见即所得）", () => {
  const { orch, versionId } = boot();
  const design = orch.readDesign(versionId);
  const variant = design.variant;
  if (!variant) return; // 当前生成必带变体；防御
  const rA = orch.exportOutlet(versionId, "sogou_pc", { skin: design.skin });
  const rB = orch.exportOutlet(versionId, "sogou_pc", { skin: variant.skin });
  assert.ok(rA.ok && rB.ok);
  if (rA.ok && rB.ok) {
    // 同版本不同主题变体应产出不同字节（配置中颜色/字号不同）
    assert.notEqual(Buffer.from(rA.bytes).toString("hex"), Buffer.from(rB.bytes).toString("hex"));
  }
});

test("ASSET-001 assetStatus：config 角色 + 确定性图标均满足（A3-001 后闭合）", () => {
  const { orch, versionId } = boot();
  const r = orch.assetStatus(versionId, "sogou_pc");
  assert.deepEqual(r.missingRequired, []); // A3-001b：状态栏图标已由确定性资产闭合
  assert.ok(r.satisfiedRequired.includes("candidateBar.background"));
  assert.ok(r.satisfiedRequired.includes("composing.text"));
  assert.ok(r.satisfiedRequired.includes("statusBar.icons"));
  assert.deepEqual(r.issues.filter((i) => i.severity === "error"), []);
  // 四出口都可查询（过渡画像）且全部闭合
  for (const o of ["sogou_android", "baidu_pc", "baidu_android"] as const) {
    assert.deepEqual(orch.assetStatus(versionId, o).missingRequired, []);
  }
});

test("QA-001 outletDeliveryLevel：未确认 → structural；确认后 sogou_pc 达 install_candidate（A3-001 资产闭合）", () => {
  const { orch, versionId } = boot();
  const a = orch.outletDeliveryLevel(versionId, "sogou_pc");
  assert.equal(a.level, "structural");
  assert.ok(a.blockers.some((b) => b.startsWith("VERSION_NOT_CONFIRMED")));

  orch.store.confirmVersion(versionId);
  const b = orch.outletDeliveryLevel(versionId, "sogou_pc");
  assert.equal(b.level, "install_candidate"); // A3-001：资产缺口已闭合
  assert.deepEqual(b.blockers, []); // 无缺口
});

test("QA-001 outletDeliveryLevel：未接校验器的出口按 not_run 阻断；平台覆盖必须有溯源", () => {
  const { orch, versionId } = boot();
  const bd = orch.outletDeliveryLevel(versionId, "baidu_pc");
  assert.ok(bd.blockers.some((x) => x.startsWith("STRUCTURAL_NOT_RUN")));

  // 平台定向反馈 → 覆盖有 feedback.targetOutlets 溯源 → 不产生 UNEXPLAINED 缺口
  const fb = orch.applyFeedback(versionId, "百度这边候选词字太小");
  const after = orch.outletDeliveryLevel(fb.version.id, "baidu_pc");
  assert.ok(!after.blockers.some((x) => x.startsWith("PLATFORM_OVERRIDE_UNEXPLAINED")));
  // 溯源覆盖的出口（baidu_pc）QA 用覆盖皮肤；未覆盖出口用主皮肤——不抛即结构正确
  assert.ok(Array.isArray(after.blockers));
});

test("A3-001 交付闸门：确认后 sogou_pc 达 install_candidate（资产闭合 + 结构过 + QA 过）", () => {
  const { orch, versionId } = boot();

  // 未确认 → structural（确认缺口）
  const pre = orch.outletDeliveryLevel(versionId, "sogou_pc");
  assert.equal(pre.level, "structural");

  orch.store.confirmVersion(versionId);
  const post = orch.outletDeliveryLevel(versionId, "sogou_pc");
  assert.deepEqual(post.blockers, [], JSON.stringify(post.blockers));
  assert.equal(post.level, "install_candidate"); // A3-001：必需位图已由确定性资产闭合

  // 其余出口仍 structural（结构校验器 not_run）
  for (const o of ["sogou_android", "baidu_pc", "baidu_android"] as const) {
    const r = orch.outletDeliveryLevel(versionId, o);
    assert.equal(r.level, "structural");
    assert.ok(r.blockers.some((b) => b.startsWith("STRUCTURAL_NOT_RUN")), o);
  }
});

test("A3-001 资产真实性：快照含四出口图标资产（hash 合法、字节可解）；导出包含 status/*.png", async () => {
  const { orch, versionId } = boot();
  const d = orch.readDesign(versionId);
  assert.ok(d.assets);
  for (const o of ["sogou_pc", "sogou_android", "baidu_pc", "baidu_android"] as const) {
    const list: Array<{ descriptor: { contentHash: string; mediaType: string; density?: string }; path: string }> = d.assets![o];
    assert.equal(list.length, 9); // MOB-003：3 枚图标 × 3 档 DPI（1x/2x/4x）
    for (const a of list) {
      assert.match(a.descriptor.contentHash, /^[0-9a-f]{64}$/);
      assert.equal(a.descriptor.mediaType, "image/png");
      assert.ok(a.path.startsWith("status/"));
    }
  }
  // PNG 签名可验（base64 解码后）
  const { base64Decode } = await import("@imskin/zip");
  const bytes = base64Decode(d.assets!.sogou_pc[0].bytesB64);
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes[1], 0x50); // 'P'

  // 导出包确实打入图标
  const { listZip } = await import("@imskin/zip");
  const exp = orch.exportOutlet(versionId, "sogou_pc");
  assert.ok(exp.ok);
  if (exp.ok) {
    const paths = listZip(exp.bytes).map((e) => e.path);
    assert.ok(paths.includes("status/zhong.png"));
    assert.ok(paths.includes("status/quan.png"));
    assert.ok(paths.includes("status/jianpan.png"));
  }
});

test("A3-001 平台覆盖重绘：定向反馈后覆盖出口资产存在；通用反馈重绘资产（hash 变化）", () => {
  const { orch, versionId } = boot();
  const before = orch.readDesign(versionId).assets!;

  // ① 通用反馈（A3 路径）："候选颜色太深" → spec 变化 → 资产按新 spec 重绘
  const generic = orch.applyFeedback(versionId, "候选的颜色太深");
  const genericAssets = orch.readDesign(generic.version.id).assets!;
  assert.notEqual(
    genericAssets.sogou_pc[0].descriptor.contentHash,
    before.sogou_pc[0].descriptor.contentHash,
    "通用反馈重绘：候选色变化应导致图标 hash 变化",
  );

  // ② 平台反馈（platform 路径）："百度这边对不齐"（layout+platform 均命中，platform 优先）→ 覆盖出口保留资产
  const plat = orch.applyFeedback(versionId, "百度这边对不齐");
  const platAssets = orch.readDesign(plat.version.id).assets!;
  assert.ok(platAssets.baidu_pc, "平台反馈版本应保留资产");
  assert.ok(platAssets.sogou_pc, "平台反馈版本应保留资产");
  // 未覆盖出口资产沿用主 spec（与原版一致，因为主 spec 未变）
  assert.equal(
    platAssets.sogou_pc[0].descriptor.contentHash,
    before.sogou_pc[0].descriptor.contentHash,
  );
});
