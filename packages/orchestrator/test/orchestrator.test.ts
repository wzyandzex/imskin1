import { test } from "node:test";
import assert from "node:assert/strict";

import { SkinOrchestrator } from "../src/index.ts";
import { provenance } from "../src/provenance.ts";
import { listZip } from "@imskin/sogou-adapter";
import type { DesignBrief } from "@imskin/skin-gen";

const BRIEF: DesignBrief = {
  styleKeywords: ["清新", "极简"],
  palette: { primary: "#3faf7d" },
  mood: "清新明亮",
  cornerRadius: "large",
};

function setup() {
  const orch = new SkinOrchestrator();
  const project = orch.createProject("我的皮肤");
  const gen = orch.generate(project.id, BRIEF, { id: "s1", name: "清新薄荷" });
  return { orch, project, gen };
}

test("generate：从简报产出一版皮肤，落成根版本且过 QA", () => {
  const { gen } = setup();
  assert.equal(gen.version.parentId, null);
  assert.ok(gen.design.skin.candidateBar.candidateColor);
  assert.equal(gen.design.qa.passed, true);
  assert.equal(gen.version.status, "ready");
  assert.match(gen.design.provenance, /^[0-9a-f]{8}$/);
});

test("深浅双模式（FR-QA-3）：生成即携带另一主题的派生变体，两变体主题相反", () => {
  const { gen } = setup();
  const d = gen.design;
  assert.ok(d.variant, "应携带双模式变体");
  assert.notEqual(d.variant!.spec.theme, d.spec.theme, "变体主题应与主版本相反");
  // 变体是完整可渲染皮肤
  assert.ok(d.variant!.skin.candidateBar.candidateColor);
  // 主版本是浅色（清新明亮）→ 变体应为深色
  assert.equal(d.spec.theme, "light");
  assert.equal(d.variant!.spec.theme, "dark");
});

test("深浅双模式：反馈作用当前模式后，变体自动一致性同步（FR-QA-3 AC3）", () => {
  const { orch, gen } = setup();
  const before = gen.design.variant!.skin.candidateBar.candidateColor;
  const fb = orch.applyFeedback(gen.version.id, "候选词字太小");
  // 规格类反馈 → 变体重派生（主题仍相反，但随主版本同步更新）
  assert.ok(fb.design.variant);
  assert.notEqual(fb.design.variant!.spec.theme, fb.design.spec.theme);
  // 变体引用了新的主 spec（非冻结的旧对象）
  assert.notEqual(fb.design.variant, gen.design.variant);
  void before;
});

test("provenance：相同输入 → 相同指纹；不同输入 → 不同指纹（与键序无关）", () => {
  assert.equal(provenance({ a: 1, b: 2 }), provenance({ b: 2, a: 1 }));
  assert.notEqual(provenance({ a: 1 }), provenance({ a: 2 }));
});

test("反馈-风格类：'想再稳重一点' 回 A1 改简报并重跑，fork 出子版本", () => {
  const { orch, gen } = setup();
  const fb = orch.applyFeedback(gen.version.id, "整体太活泼了，想再稳重一点");
  assert.equal(fb.classification.type, "style");
  assert.equal(fb.route.rerunFrom, "A1");
  assert.equal(fb.version.parentId, gen.version.id); // 版本树 fork
  // 简报的情绪/关键词被调整（稳重进入）
  const joined = [fb.design.brief.mood ?? "", ...fb.design.brief.styleKeywords].join(" ");
  assert.match(joined, /稳重/);
  assert.equal(fb.design.qa.passed, true);
  // 回归：皮肤 meta.mood 必须跟随 brief.mood 更新（不得停留在旧值）
  assert.equal(fb.design.skin.meta.mood, fb.design.brief.mood);
});

test("反馈-资产参数类：'候选词字太小' 在 VisualSpec 上最小改字号，简报不变", () => {
  const { orch, gen } = setup();
  const before = gen.design.spec.candidateBar.font.size;
  const fb = orch.applyFeedback(gen.version.id, "候选词字太小了");
  assert.equal(fb.classification.type, "asset_param");
  assert.equal(fb.design.spec.candidateBar.font.size, before + 2);
  // 简报未被牵动（只改了 spec）
  assert.deepEqual(fb.design.brief, gen.design.brief);
});

test("反馈-平台类：路由到 A3-platform，scope 写明平台", () => {
  const { orch, gen } = setup();
  const fb = orch.applyFeedback(gen.version.id, "百度这边候选词对不齐，搜狗是好的");
  assert.equal(fb.classification.type, "platform");
  assert.equal(fb.route.rerunFrom, "A3-platform");
});

test("版本树：根 → 反馈版本 的血缘链长度为 2", () => {
  const { orch, gen } = setup();
  const fb = orch.applyFeedback(gen.version.id, "想再稳重一点");
  const line = orch.lineage(fb.version.id);
  assert.equal(line.length, 2);
  assert.equal(line[0].id, gen.version.id);
  assert.equal(line[1].id, fb.version.id);
});

test("导出搜狗 .ssf：产物是合法 zip，含 skin.ini，且 ini 带皮肤名与候选配色", () => {
  const { orch, gen } = setup();
  const out = orch.exportSogou(gen.version.id);
  assert.equal(out.imageCount, 0); // 无真实切图时仅 skin.ini
  const entries = listZip(out.bytes);
  const ini = entries.find((e) => e.path === "skin.ini");
  assert.ok(ini, "产物应包含 skin.ini");
  assert.match(out.iniText, /清新薄荷/);
  // 颜色以搜狗 BGR 十六进制写入（#RRGGBB → bbggrr），故校验重排后的编码而非原 #RRGGBB
  const c = gen.design.skin.candidateBar.candidateColor.replace(/^#/, "");
  const bgr = (c.slice(4, 6) + c.slice(2, 4) + c.slice(0, 2)).toLowerCase();
  assert.match(out.iniText, new RegExp(`zhongwen_color=${bgr}`));
});

test("导出可带切图：提供 images 时打入 .ssf", () => {
  const { orch, gen } = setup();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const out = orch.exportSogou(gen.version.id, { images: [{ path: "bg_h.png", data: png }] });
  assert.equal(out.imageCount, 1);
  const entries = listZip(out.bytes);
  const img = entries.find((e) => e.path === "bg_h.png");
  assert.ok(img);
  assert.deepEqual(img!.data, png);
});

test("导出百度移动 .bds：合法 zip，含 Info/css.ini（骨架），皮肤名写入", () => {
  const { orch, gen } = setup();
  const out = orch.exportBaiduMobile(gen.version.id);
  assert.equal(out.layoutCount, 0); // 无真实布局 → 骨架
  const entries = listZip(out.bytes);
  const info = entries.find((e) => e.path === "Info.txt");
  assert.ok(info, "产物应含 Info.txt");
  const text = new TextDecoder().decode(info!.data);
  assert.ok(text.includes("Name=清新薄荷"));
  const css = entries.find((e) => e.path === "css.ini");
  assert.ok(css, "产物应含 css.ini");
  assert.ok(new TextDecoder().decode(css.data).includes("[CAND]"));
});

test("导出百度移动 .bds：提供 port/land 布局与素材时打入", () => {
  const { orch, gen } = setup();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const out = orch.exportBaiduMobile(gen.version.id, {
    port: [{ path: "candidate.ini", content: "[CAND]\r\nHEIGHT=96\r\n" }],
    images: [{ path: "res/back1.png", data: png }],
  });
  assert.equal(out.layoutCount, 1);
  assert.equal(out.imageCount, 1);
  const entries = listZip(out.bytes);
  const layout = new TextDecoder().decode(entries.find((e) => e.path === "port/candidate.ini")!.data);
  assert.ok(layout.includes("[CAND]"));
  assert.ok(entries.some((e) => e.path === "res/back1.png"));
});

test("导出百度 PC .bps：合法 zip，含 skin.ini/Skin.xml/Candidate.xml/Status.xml，皮肤名写入", () => {
  const { orch, gen } = setup();
  const out = orch.exportBaiduPc(gen.version.id);
  const entries = listZip(out.bytes);
  const paths = entries.map((e) => e.path);
  for (const p of ["skin.ini", "Skin.xml", "Candidate.xml", "Status.xml"]) {
    assert.ok(paths.includes(p), `缺少 ${p}`);
  }
  const skinIni = new TextDecoder("utf-16le").decode(entries.find((e) => e.path === "skin.ini")!.data);
  assert.ok(skinIni.includes("name=清新薄荷"));
  const cand = new TextDecoder().decode(entries.find((e) => e.path === "Candidate.xml")!.data);
  assert.ok(cand.includes("<CCandidateWin"));
  assert.ok(cand.includes("clrCand="), "配色应映射进 Candidate.xml");
});

test("导出搜狗移动 .ssf：合法 zip，含 phoneTheme.ini/Skin.ini，皮肤名写入", () => {
  const { orch, gen } = setup();
  const out = orch.exportSogouMobile(gen.version.id);
  assert.equal(out.layoutCount, 0);
  const entries = listZip(out.bytes);
  const paths = entries.map((e) => e.path);
  assert.ok(paths.includes("phoneTheme.ini"));
  assert.ok(paths.includes("Skin.ini"));
  const theme = new TextDecoder().decode(entries.find((e) => e.path === "phoneTheme.ini")!.data);
  assert.ok(theme.includes("ThemeName=清新薄荷"));
});

test("对无设计数据的版本迭代/导出 → 明确报错，不静默产假", () => {
  const orch = new SkinOrchestrator();
  const p = orch.createProject("空项目");
  const bare = orch.store.addVersion(p.id, { data: { note: "无设计" } });
  assert.throws(() => orch.applyFeedback(bare.id, "字太小"), /缺少可迭代的设计数据/);
  assert.throws(() => orch.exportSogou(bare.id), /缺少可迭代的设计数据/);
});
