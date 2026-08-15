/**
 * contracts 契约测试 —— parser/guard/不变量的行为锁定（DOM-001）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OUTLETS,
  OUTLET_API_KEYS,
  OUTLET_EXTENSIONS,
  apiKeyFromOutlet,
  artifactExtensionMatches,
  isAtLeast,
  isChangeInstruction,
  isDeliveryLevel,
  isDiagnostic,
  isInstallable,
  isOutlet,
  isPackageArtifact,
  instructionOutletsValid,
  needsTargetConfirmation,
  outletDeviceClass,
  outletFromApiKey,
  outletFromParts,
  outletVendor,
  parseDeliveryLevel,
  parseOutlet,
} from "../src/index.ts";

test("OUTLETS 恰为四出口，vendor/device 拆分正确", () => {
  assert.deepEqual([...OUTLETS], ["sogou_pc", "sogou_android", "baidu_pc", "baidu_android"]);
  assert.equal(outletVendor("sogou_android"), "sogou");
  assert.equal(outletDeviceClass("sogou_android"), "android");
  assert.equal(outletVendor("baidu_pc"), "baidu");
  assert.equal(outletDeviceClass("baidu_pc"), "pc");
});

test("outletFromParts：合法组合返回 Outlet，非法成员返回 null", () => {
  assert.equal(outletFromParts("sogou", "pc"), "sogou_pc");
  assert.equal(outletFromParts("baidu", "android"), "baidu_android");
  assert.equal(outletFromParts("sogou", "mobile"), null);
  assert.equal(outletFromParts("gboard", "pc"), null);
});

test("parseOutlet：合法值通过；API 键名/mobile/连字符给出可操作提示", () => {
  for (const o of OUTLETS) {
    const r = parseOutlet(o);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value, o);
  }
  const apiStyle = parseOutlet("sogouPc");
  assert.equal(apiStyle.ok, false);
  if (!apiStyle.ok) assert.match(apiStyle.issues[0], /sogou_pc/);

  const mobile = parseOutlet("sogou_mobile");
  assert.equal(mobile.ok, false);
  if (!mobile.ok) assert.match(mobile.issues[0], /android/);

  const dash = parseOutlet("baidu-pc");
  assert.equal(dash.ok, false);
  if (!dash.ok) assert.match(dash.issues[0], /baidu_pc/);

  assert.equal(parseOutlet(42).ok, false);
});

test("API 键名 ↔ Outlet 双向转换", () => {
  for (const o of OUTLETS) {
    const key = apiKeyFromOutlet(o);
    assert.equal(OUTLET_API_KEYS[o], key);
    assert.equal(outletFromApiKey(key), o);
  }
  assert.equal(outletFromApiKey("sogou-pc"), null);
});

test("DeliveryLevel：解析、排序与 blocked 语义", () => {
  assert.equal(isDeliveryLevel("install_verified"), true);
  assert.equal(isDeliveryLevel("published"), false);
  assert.equal(parseDeliveryLevel("structural").ok, true);
  assert.equal(parseDeliveryLevel("strutural").ok, false); // 拼错拒收

  assert.equal(isAtLeast("install_verified", "install_candidate"), true);
  assert.equal(isAtLeast("structural", "previewable"), false);
  assert.equal(isAtLeast("structural", "structural"), true);
  // blocked 不参与比较（有阻断 ≠ 更低完成度）
  assert.equal(isAtLeast("blocked", "not_started"), false);
  assert.equal(isAtLeast("install_verified", "blocked"), false);

  assert.equal(isInstallable("install_verified"), true);
  assert.equal(isInstallable("install_candidate"), false); // 无真机证据不可称可安装
});

test("isDiagnostic：字段齐备通过；缺 userMessage/错 severity 拒收", () => {
  const d = {
    code: "OUTLET_BUILD_FAILED",
    stage: "A4",
    severity: "error",
    userMessage: "导出失败，请重试",
    technicalMessage: "zip write failed at entry bg.png",
    retryable: true,
    elementIds: ["keyboard.background"],
    outlets: ["sogou_pc"],
  };
  assert.equal(isDiagnostic(d), true);
  assert.equal(isDiagnostic({ ...d, userMessage: "" }), false);
  assert.equal(isDiagnostic({ ...d, severity: "fatal" }), false);
  assert.equal(isDiagnostic({ ...d, retryable: "yes" }), false);
  assert.equal(isDiagnostic({ ...d, outlets: ["sogou_ios"] }), false);
  assert.equal(isDiagnostic(null), false);
});

test("OUTLET_EXTENSIONS：四出口扩展名唯一权威映射", () => {
  assert.equal(OUTLET_EXTENSIONS.sogou_pc, ".ssf");
  assert.equal(OUTLET_EXTENSIONS.sogou_android, ".ssf");
  assert.equal(OUTLET_EXTENSIONS.baidu_pc, ".bps");
  assert.equal(OUTLET_EXTENSIONS.baidu_android, ".bds");
});

test("isPackageArtifact：必填字段/SHA-256 形态校验 + 扩展名一致性", () => {
  const a = {
    schemaVersion: 1,
    id: "art_1",
    projectId: "prj_1",
    versionId: "ver_1",
    outlet: "sogou_pc",
    fileName: "demo-sogou-pc.ssf",
    extension: ".ssf",
    mediaType: "application/octet-stream",
    byteLength: 1024,
    sha256: "a".repeat(64),
    buildProfileVersion: "0.0.1",
    createdAt: "2026-08-16T00:00:00.000Z",
    structuralReportId: "sr_1",
    qaReportIds: ["qa_1"],
    deliveryLevel: "install_candidate",
    experimental: false,
  };
  assert.equal(isPackageArtifact(a), true);
  assert.equal(artifactExtensionMatches(a), true);
  assert.equal(isPackageArtifact({ ...a, sha256: "XYZ" }), false);
  assert.equal(isPackageArtifact({ ...a, outlet: "sogouPc" }), false); // API 键名不是领域值
  assert.equal(isPackageArtifact({ ...a, deliveryLevel: "shipped" }), false);
  // 文件名与 outlet 扩展名不一致 → 契约层可检出
  assert.equal(artifactExtensionMatches({ ...a, fileName: "demo.bds" } as never), false);
});

test("isChangeInstruction：枚举/数组/置信度校验", () => {
  const c = {
    schemaVersion: 1,
    category: "asset_param",
    targetElementIds: ["candidateBar.candidateText"],
    targetOutlets: [],
    operation: "adjust",
    fieldPath: "candidateBar.fontSize",
    delta: 2,
    preserveElementIds: ["keyboard.key.normal"],
    confidence: 0.92,
    reason: "候选词字太小",
  };
  assert.equal(isChangeInstruction(c), true);
  assert.equal(needsTargetConfirmation(c), false);
  assert.equal(isChangeInstruction({ ...c, confidence: 1.5 }), false);
  assert.equal(needsTargetConfirmation({ ...c, confidence: 0.5 }), true);
  assert.equal(isChangeInstruction({ ...c, operation: "tweak" }), false);
  assert.equal(isChangeInstruction({ ...c, targetElementIds: [""] }), false);
});

test("平台类指令必须带目标出口（不变量）", () => {
  const base = {
    schemaVersion: 1,
    category: "platform",
    targetElementIds: ["candidateBar.background"],
    targetOutlets: [],
    operation: "adjust",
    fieldPath: "candidateBar.background",
    preserveElementIds: [],
    confidence: 0.9,
    reason: "百度这边对不齐",
  } as const;
  assert.equal(isChangeInstruction(base), true);
  assert.equal(instructionOutletsValid(base), false); // platform 无出口 → 违反不变量
  const withOutlet = { ...base, targetOutlets: ["baidu_pc", "baidu_android"] };
  assert.equal(instructionOutletsValid(withOutlet), true);
  // style 类允许空出口（作用于全部）
  assert.equal(instructionOutletsValid({ ...base, category: "style" }), true);
});

test("isOutlet guard 对边界值行为", () => {
  assert.equal(isOutlet("sogou_pc"), true);
  assert.equal(isOutlet("SOGOU_PC"), false); // 大小写敏感
  assert.equal(isOutlet(undefined), false);
});
