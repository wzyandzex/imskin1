import { test } from "node:test";
import assert from "node:assert/strict";

import { SkinOrchestrator } from "../src/orchestrator.ts";
import type { DesignBrief } from "@imskin/skin-gen";

const BRIEF: DesignBrief = {
  styleKeywords: ["清新", "极简"],
  palette: { primary: "#3faf7d" },
  mood: "清新明亮",
  cornerRadius: "large",
};

function boot() {
  const orch = new SkinOrchestrator();
  const p = orch.createProject("P1");
  const g = orch.generate(p.id, BRIEF, { id: "s1", name: "基线" });
  return { orch, versionId: g.version.id };
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("PIPE-001 平台定向：'百度这边候选词字太小' 只改 baidu 两出口，主设计与搜狗出口不变", () => {
  const { orch, versionId } = boot();
  const before = orch.readDesign(versionId);

  const fb = orch.applyFeedback(versionId, "百度这边候选词字太小");
  const after = fb.design;

  // hints 透传：scope 写明百度；反馈溯源记录目标出口
  assert.match(fb.route.scope, /百度/);
  assert.deepEqual(after.feedback?.targetOutlets, ["baidu_pc", "baidu_android"]);

  // 主设计零改动（token diff 证明：brief/spec/skin 与父版本 deepEqual）
  assert.deepEqual(after.brief, before.brief);
  assert.deepEqual(after.spec, before.spec);
  assert.deepEqual(after.skin, before.skin);

  // 出口覆盖：仅 baidu 两口存在，且其 spec 相对主 spec 有候选栏 token 变化
  const ov = after.outletOverrides;
  assert.ok(ov);
  assert.deepEqual(Object.keys(ov).sort(), ["baidu_android", "baidu_pc"]);
  assert.notDeepEqual(ov!.baidu_pc!.spec.candidateBar, before.spec.candidateBar);
  assert.equal(ov!.baidu_pc!.skin.meta.platform, "baidu");
  assert.equal(ov!.baidu_android!.skin.meta.platform, "baidu");
  assert.equal(ov!.baidu_android!.skin.meta.device, "mobile");
  assert.ok(ov!.baidu_pc!.variant, "覆盖携带深浅变体");

  // 字节级证明：sogou 两口导出与父版本完全一致；baidu 两口发生变化
  for (const o of ["sogou_pc", "sogou_android", "baidu_pc", "baidu_android"] as const) {
    const a = orch.exportOutlet(versionId, o);
    const b = orch.exportOutlet(fb.version.id, o);
    assert.ok(a.ok && b.ok);
    if (o.startsWith("sogou")) {
      assert.equal(hex(b.bytes), hex(a.bytes), `${o} 不应被百度定向反馈改动`);
    } else {
      assert.notEqual(hex(b.bytes), hex(a.bytes), `${o} 应体现定向修改`);
    }
  }
});

test("PIPE-001 通用风格反馈：重生成主设计并清空出口覆盖（四端重新同步）", () => {
  const { orch, versionId } = boot();
  const pf = orch.applyFeedback(versionId, "百度这边候选词字太小");
  assert.ok(pf.design.outletOverrides);

  const gen = orch.applyFeedback(pf.version.id, "整体太活泼了，想再稳重一点");
  assert.equal(gen.route.rerunFrom, "A1"); // 走 A1 主设计重生成
  assert.equal(gen.design.outletOverrides, undefined); // 覆盖被清空 → 四端重新基于主设计
  // A1 生效证据：brief 被改写（追加稳重关键词/情绪）；spec 是否随之变化取决于
  // briefToSpec 的确定性派生（既有行为），此处不断言 spec 差异。
  assert.deepEqual(gen.design.brief.styleKeywords, ["清新", "极简", "稳重"]);
  assert.ok(String(gen.design.brief.mood).includes("稳重"));
});

test("PIPE-001 平台类无厂商指代：降级通用 A3 修改主设计，scope 泛化不定向", () => {
  const { orch, versionId } = boot();
  const fb = orch.applyFeedback(versionId, "这个平台的布局要调");
  assert.equal(fb.route.rerunFrom, "A3-platform");
  assert.match(fb.route.scope, /对应（搜狗\/百度）/);
  assert.equal(fb.design.feedback?.targetOutlets, undefined);
  assert.equal(fb.design.outletOverrides, undefined);
});

test("PIPE-001 exportSkinSet 同样消费出口覆盖（聚合口径一致）", () => {
  const { orch, versionId } = boot();
  const fb = orch.applyFeedback(versionId, "百度这边候选词字太小");
  const base = orch.exportSkinSet(versionId);
  const after = orch.exportSkinSet(fb.version.id);
  assert.equal(hex(after.sogouPc), hex(base.sogouPc));
  assert.equal(hex(after.sogouMobile), hex(base.sogouMobile));
  assert.notEqual(hex(after.baiduPc), hex(base.baiduPc));
  assert.notEqual(hex(after.baiduMobile), hex(base.baiduMobile));
});
