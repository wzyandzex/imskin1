/**
 * ASSET-001 资产完整性检查（G2）测试。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkAssetBundle } from "../src/assets.ts";
import { SOGOU_PC_ASSET_PROFILE, profileForOutlet, isAssetDescriptor } from "@imskin/contracts";

const ALL_TOKENS = (p: string) => p.length > 0;

function pngAsset(role: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `ast_${role}`,
    role,
    mediaType: "image/png",
    contentHash: "a".repeat(64),
    byteLength: 1024,
    source: "generated",
    ...overrides,
  };
}

test("config 必需角色齐备 + 状态栏位图提供 → 无 error，必需全满足", () => {
  const r = checkAssetBundle({
    profile: SOGOU_PC_ASSET_PROFILE,
    hasToken: ALL_TOKENS,
    assets: [pngAsset("statusBar.icons")],
  });
  assert.deepEqual(r.issues.filter((i) => i.severity === "error"), []);
  assert.deepEqual(r.missingRequired, []);
  assert.ok(r.satisfiedRequired.includes("candidateBar.background"));
  assert.ok(r.satisfiedRequired.includes("statusBar.icons"));
});

test("token 缺失与位图缺失 → 各自 error 且进入 missingRequired（install_candidate 缺口清单）", () => {
  const r = checkAssetBundle({
    profile: SOGOU_PC_ASSET_PROFILE,
    hasToken: (p) => p !== "candidateBar.bg", // 缺候选栏背景 token
    assets: [], // 缺状态栏位图
  });
  const codes = r.issues.filter((i) => i.severity === "error").map((i) => i.code);
  assert.ok(codes.includes("ASSET_CONFIG_TOKEN_MISSING"));
  assert.ok(codes.includes("ASSET_MISSING"));
  assert.deepEqual(r.missingRequired.sort(), ["candidateBar.background", "statusBar.icons"]);
});

test("媒体类型不符 → error ASSET_MEDIA_TYPE_MISMATCH", () => {
  const r = checkAssetBundle({
    profile: SOGOU_PC_ASSET_PROFILE,
    hasToken: ALL_TOKENS,
    assets: [pngAsset("statusBar.icons", { mediaType: "image/webp" })],
  });
  const err = r.issues.find((i) => i.code === "ASSET_MEDIA_TYPE_MISMATCH");
  assert.ok(err);
  assert.ok(r.missingRequired.includes("statusBar.icons"));
});

test("非法描述符被拒（warning）且孤儿角色暴露", () => {
  // 裁剪画像：去掉 preview.image 条目 → 合法的 preview 位图成为孤儿
  const trimmed = {
    ...SOGOU_PC_ASSET_PROFILE,
    entries: SOGOU_PC_ASSET_PROFILE.entries.filter((e) => e.role !== "preview.image"),
  };
  const r = checkAssetBundle({
    profile: trimmed,
    hasToken: ALL_TOKENS,
    assets: [
      { id: "bad", role: "statusBar.icons", mediaType: "image/png", contentHash: "XYZ", byteLength: 0, source: "generated" }, // 非法
      pngAsset("preview.image"), // 合法但已不在画像内 → 孤儿
    ],
  });
  assert.ok(r.issues.some((i) => i.code === "ASSET_DESCRIPTOR_INVALID"));
  assert.ok(r.issues.some((i) => i.code === "ASSET_ORPHAN" && i.severity === "warning"));
  assert.ok(r.missingRequired.includes("statusBar.icons")); // 非法描述符不能顶替必需位图
});

test("profileForOutlet：四出口都有画像；非搜狗 PC 用过渡画像（outlet 改写）", () => {
  for (const o of ["sogou_pc", "sogou_android", "baidu_pc", "baidu_android"] as const) {
    const p = profileForOutlet(o);
    assert.equal(p.outlet, o);
    assert.ok(p.entries.length >= 5);
  }
  assert.equal(isAssetDescriptor(pngAsset("preview.image")), true);
  assert.equal(isAssetDescriptor({ nope: 1 }), false);
});
