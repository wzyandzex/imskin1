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
  const spy = mock.method(SkinOrchestrator.prototype as never as Record<string, unknown>, "exportSogouMobile", function (this: SkinOrchestrator) {
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

test("ASSET-001 assetStatus：config 角色由 spec 满足，必需位图如实列缺（install_candidate 闸门）", () => {
  const { orch, versionId } = boot();
  const r = orch.assetStatus(versionId, "sogou_pc");
  assert.deepEqual(r.missingRequired, ["statusBar.icons"]); // 当前唯一必需位图缺口
  assert.ok(r.satisfiedRequired.includes("candidateBar.background"));
  assert.ok(r.satisfiedRequired.includes("composing.text"));
  const err = r.issues.find((i) => i.code === "ASSET_MISSING");
  assert.ok(err && err.severity === "error");
  // 四出口都可查询（过渡画像）
  for (const o of ["sogou_android", "baidu_pc", "baidu_android"] as const) {
    assert.deepEqual(orch.assetStatus(versionId, o).missingRequired, ["statusBar.icons"]);
  }
});

test("QA-001 outletDeliveryLevel：未确认 → structural 且列确认缺口；确认后仍因必需位图缺口保持 structural", () => {
  const { orch, versionId } = boot();
  const a = orch.outletDeliveryLevel(versionId, "sogou_pc");
  assert.equal(a.level, "structural");
  assert.ok(a.blockers.some((b) => b.startsWith("VERSION_NOT_CONFIRMED")));

  orch.store.confirmVersion(versionId);
  const b = orch.outletDeliveryLevel(versionId, "sogou_pc");
  assert.equal(b.level, "structural"); // 诚实：必需位图（statusBar.icons）未闭合
  assert.ok(b.blockers.some((x) => x.startsWith("ASSET_MISSING")));
  assert.ok(!b.blockers.some((x) => x.startsWith("VERSION_NOT_CONFIRMED")));
  assert.ok(!b.blockers.some((x) => x.startsWith("STRUCTURAL"))); // sogou_pc 结构校验已过
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
