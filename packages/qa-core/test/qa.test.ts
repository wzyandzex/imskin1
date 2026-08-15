import { test } from "node:test";
import assert from "node:assert/strict";

import { checkReadability, checkConsistency, checkSkin } from "../src/index.ts";
import { generateSkin, EXAMPLE_BRIEFS } from "@imskin/skin-gen";
import type { SkinManifest } from "@imskin/skin-gen";

/** 用 skin-gen 的确定性生成器造一份"生成即达标"的基准皮肤（三处对比度均 ≥ 4.5）。 */
function makeBase(index = 0): SkinManifest {
  const ex = EXAMPLE_BRIEFS[index];
  return generateSkin(ex.brief, { id: ex.id, name: ex.name });
}

/** 深拷贝，避免用例间相互污染。 */
function clone(skin: SkinManifest): SkinManifest {
  return structuredClone(skin);
}

test("基准：generateSkin 造的皮肤三处可读性均达标（checkReadability 无 error）", () => {
  for (let i = 0; i < EXAMPLE_BRIEFS.length; i++) {
    const issues = checkReadability(makeBase(i));
    const errs = issues.filter((x) => x.severity === "error");
    assert.equal(errs.length, 0, `基准皮肤不应有 error：${JSON.stringify(errs)}`);
  }
});

test("checkSkin：generateSkin 造的皮肤 passed 为 true", () => {
  const report = checkSkin(makeBase(0));
  assert.equal(report.passed, true);
  assert.ok(Array.isArray(report.issues));
});

test("候选文字与背景对比极低 → checkReadability 报 error", () => {
  const s = clone(makeBase(0));
  s.candidateBar.background = { type: "solid", color: "#ffffff" };
  s.candidateBar.candidateColor = "#fafafa"; // 近白文字压在白底上
  const issues = checkReadability(s);
  const err = issues.find((x) => x.severity === "error" && (x.where ?? "").includes("候选文字"));
  assert.ok(err, "应针对候选文字/背景报 error");
  assert.equal(err!.code, "READABILITY_LOW_CONTRAST");
});

test("选中文字与选中底对比极低 → error 定位在选中处", () => {
  const s = clone(makeBase(0));
  s.candidateBar.selectedFill = { type: "solid", color: "#ffffff" };
  s.candidateBar.selectedColor = "#f0f0f0";
  const err = checkReadability(s).find((x) => x.severity === "error" && (x.where ?? "").includes("选中文字"));
  assert.ok(err, "应针对选中文字/选中底报 error");
});

test("按键文字与按键填充对比极低 → error 定位在按键处", () => {
  const s = clone(makeBase(0));
  s.keyboard.key.fill = { type: "solid", color: "#ffffff" };
  s.keyboard.key.color = "#f2f2f2";
  const err = checkReadability(s).find((x) => x.severity === "error" && (x.where ?? "").includes("按键文字"));
  assert.ok(err, "应针对按键文字/按键填充报 error");
});

test("gradient 背景保守判断：from 达标但 to 不达标 → 仍报 error", () => {
  const s = clone(makeBase(0));
  // 白字：#333 端对比高（达标），#ddd 端对比极低（不达标）→ 取较差端应判 error
  s.candidateBar.background = { type: "gradient", from: "#333333", to: "#dddddd", angle: 0 };
  s.candidateBar.candidateColor = "#ffffff";
  const err = checkReadability(s).find((x) => x.severity === "error" && (x.where ?? "").includes("候选文字"));
  assert.ok(err, "渐变较差端不达标应报 error");
  assert.match(err!.message, /渐变取较差端/);
});

test("gradient 背景两端都达标 → 不误报（保守判断不是一刀切）", () => {
  const s = clone(makeBase(0));
  s.candidateBar.background = { type: "gradient", from: "#111111", to: "#333333", angle: 0 };
  s.candidateBar.candidateColor = "#ffffff"; // 两端皆深，白字均达标
  const err = checkReadability(s).find(
    (x) => x.code === "READABILITY_LOW_CONTRAST" && (x.where ?? "").includes("候选文字"),
  );
  assert.equal(err, undefined, "两端达标不应报 error");
});

test("gradient 一端确凿不达标、另一端无法解析 → 仍报 error（不被无法解析端掩盖，且与端序无关）", () => {
  // from=#dddddd 与白字对比约 1.2（确凿失败），to=rgba(...) 无法静态解析。
  // 释放前闸门不能因“另一端算不出来”就把已知的不可读区域降级为 warning 放行。
  for (const bg of [
    { type: "gradient", from: "#dddddd", to: "rgba(0,0,0,0.5)", angle: 0 } as const,
    { type: "gradient", from: "rgba(0,0,0,0.5)", to: "#dddddd", angle: 0 } as const, // 端序对调，结果应一致
  ]) {
    const s = clone(makeBase(0));
    s.candidateBar.background = bg;
    s.candidateBar.candidateColor = "#ffffff";
    const issues = checkReadability(s);
    const err = issues.find((x) => x.severity === "error" && (x.where ?? "").includes("候选文字"));
    assert.ok(err, `可解析端已确凿不达标应报 error（bg=${JSON.stringify(bg)}）`);
    assert.equal(err!.code, "READABILITY_LOW_CONTRAST");
    // 不应因无法解析端而降级为 warning
    assert.equal(
      issues.some((x) => x.code === "READABILITY_UNPARSABLE" && (x.where ?? "").includes("候选文字")),
      false,
      "确凿失败时不应再退化为 UNPARSABLE warning",
    );
  }
});

test("gradient 一端达标、另一端无法解析 → 降级 warning（既不误报 error，也不静默放行）", () => {
  const s = clone(makeBase(0));
  // from=#111111 与白字对比很高（达标），to=rgba(...) 无法解析 → 无确凿失败，但也无法完全判定。
  s.candidateBar.background = { type: "gradient", from: "#111111", to: "rgba(0,0,0,0.5)", angle: 0 };
  s.candidateBar.candidateColor = "#ffffff";
  const issues = checkReadability(s).filter((x) => (x.where ?? "").includes("候选文字"));
  assert.equal(issues.length, 1, "应恰好产出一条针对候选文字的 issue");
  assert.equal(issues[0].code, "READABILITY_UNPARSABLE");
  assert.equal(issues[0].severity, "warning");
});

test("文字色无法静态解析（命名色/rgba）→ warning（不臆断达标）", () => {
  const s = clone(makeBase(0));
  s.candidateBar.background = { type: "solid", color: "#ffffff" };
  s.candidateBar.candidateColor = "rgba(0,0,0,0.5)"; // 文字侧无法静态解析
  const issue = checkReadability(s).find((x) => (x.where ?? "").includes("候选文字"));
  assert.ok(issue, "应产出一条 issue");
  assert.equal(issue!.code, "READABILITY_UNPARSABLE");
  assert.equal(issue!.severity, "warning");
});

test("image 填充 → warning（位图需渲染后校验）", () => {
  const s = clone(makeBase(0));
  s.candidateBar.background = { type: "image", src: "assets/bg.png" };
  const warn = checkReadability(s).find((x) => x.code === "READABILITY_IMAGE");
  assert.ok(warn, "位图填充应产出 warning");
  assert.equal(warn!.severity, "warning");
  assert.match(warn!.message, /位图|Canvas/);
});

test("checkSkin：仅含 image warning 时仍放行（warning 不阻断，passed 为 true）", () => {
  const s = clone(makeBase(0));
  s.candidateBar.background = { type: "image", src: "assets/bg.png" };
  const report = checkSkin(s);
  assert.equal(report.passed, true);
  assert.ok(report.issues.some((x) => x.severity === "warning" && x.code === "READABILITY_IMAGE"));
});

test("checkSkin：存在低对比 error 时 passed 为 false 且 issues 含该 error", () => {
  const s = clone(makeBase(0));
  s.keyboard.key.fill = { type: "solid", color: "#ffffff" };
  s.keyboard.key.color = "#eeeeee";
  const report = checkSkin(s);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((x) => x.severity === "error"));
});

test("checkConsistency：背景/选中色迥异的两份皮肤 → 出 warning", () => {
  const light = generateSkin(EXAMPLE_BRIEFS[0].brief, { id: "a", name: "浅" }); // 清新薄荷（浅）
  const dark = generateSkin(EXAMPLE_BRIEFS[1].brief, { id: "b", name: "深" }); // 赛博夜航（深）
  const issues = checkConsistency(light, dark);
  assert.ok(issues.some((x) => x.severity === "warning" && x.code === "CONSISTENCY_DIVERGENCE"), "迥异出口应出色差 warning");
});

test("checkConsistency：两份相同皮肤 → 无 warning", () => {
  const s = makeBase(0);
  const issues = checkConsistency(s, clone(s));
  assert.equal(issues.length, 0);
});

test("checkConsistency：一侧背景为位图 → undecidable warning（待渲染后校验）", () => {
  const base = makeBase(0);
  const withImage = clone(base);
  withImage.keyboard.background = { type: "image", src: "assets/bg.png" };
  const issues = checkConsistency(withImage, base);
  assert.ok(issues.some((x) => x.code === "CONSISTENCY_UNDECIDABLE"));
});

test("QAIssue 结构完整：含 code / severity / message / where", () => {
  const s = clone(makeBase(0));
  s.candidateBar.background = { type: "solid", color: "#ffffff" };
  s.candidateBar.candidateColor = "#ffffff"; // 对比度 = 1
  const issue = checkReadability(s).find((x) => x.severity === "error");
  assert.ok(issue);
  assert.equal(typeof issue!.code, "string");
  assert.ok(issue!.code.length > 0);
  assert.equal(issue!.severity, "error");
  assert.equal(typeof issue!.message, "string");
  assert.equal(typeof issue!.where, "string");
});

test("checkReadability：自定义 minRatio 更严时，原本达标的皮肤被判 error", () => {
  const s = makeBase(0);
  assert.equal(checkReadability(s).filter((x) => x.severity === "error").length, 0);
  // 提到 21（理论上限）后几乎不可能达标 → 三处都应报 error
  const strict = checkReadability(s, 21).filter((x) => x.severity === "error");
  assert.ok(strict.length >= 1, "minRatio 提高后应出现 error");
});
