import { test } from "node:test";
import assert from "node:assert/strict";

import { SkinOrchestrator } from "../src/index.ts";
import type { DesignBrief } from "@imskin/skin-gen";

const BRIEF: DesignBrief = { styleKeywords: ["清新", "极简"], palette: { primary: "#3faf7d" }, mood: "清新明亮" };

function setup() {
  const orch = new SkinOrchestrator();
  const project = orch.createProject("测试");
  const gen = orch.generate(project.id, BRIEF, { id: "s1", name: "清新" });
  return { orch, project, gen };
}

test("applyFeedbackSmart：无 LLM 钩子 → 走确定性路径", async () => {
  const { orch, gen } = setup();
  const fb = await orch.applyFeedbackSmart(gen.version.id, "候选词字太小");
  assert.equal(fb.classification.type, "asset_param");
  assert.ok(fb.version.parentId === gen.version.id);
});

test("applyFeedbackSmart：LLM 钩子返回 direction → 用增强文本", async () => {
  const { orch, gen } = setup();
  let seen = "";
  orch.llm = {
    understandFeedback: async (text) => {
      seen = text;
      return { type: "style", direction: "更稳重、更高级", target: "整体" };
    },
  };
  const fb = await orch.applyFeedbackSmart(gen.version.id, "感觉有点廉价");
  assert.equal(seen, "感觉有点廉价");
  // 增强文本"更稳重"命中 style → 回 A1 改 brief
  assert.equal(fb.classification.type, "style");
  assert.ok(fb.design.brief.mood?.includes("稳重"));
});

test("applyFeedbackSmart：LLM 钩子抛错 → 诚实降级走确定性，不中断", async () => {
  const { orch, gen } = setup();
  orch.llm = {
    understandFeedback: async () => {
      throw new Error("llm down");
    },
  };
  const fb = await orch.applyFeedbackSmart(gen.version.id, "候选词字太小");
  assert.equal(fb.classification.type, "asset_param"); // 确定性分类仍生效
});

test("generateKeyboardBg：无钩子返回 null；有钩子返回字节；钩子抛错返回 null", async () => {
  const { orch, gen } = setup();
  assert.equal(await orch.generateKeyboardBg(gen.version.id), null);
  orch.llm = { generateKeyboardBg: async () => new Uint8Array([137, 80, 78, 71]) };
  assert.deepEqual([...(await orch.generateKeyboardBg(gen.version.id))!], [137, 80, 78, 71]);
  orch.llm = { generateKeyboardBg: async () => { throw new Error("x"); } };
  assert.equal(await orch.generateKeyboardBg(gen.version.id), null);
});

test("exportSkinSet：附带 images 时打入包", async () => {
  const { orch, gen } = setup();
  const images = [{ path: "bg.png", data: new Uint8Array([1, 2, 3]) }];
  const set = orch.exportSkinSet(gen.version.id, { images });
  assert.ok(set.sogouPc.length > 0);
  assert.ok(set.sogouMobile.length > 0);
});
