import { test } from "node:test";
import assert from "node:assert/strict";
import { capabilityForModel, defaultTier, tierById } from "../src/reasoning.ts";

test("capabilityForModel：OpenAI o 系列 → reasoning_effort 三档", () => {
  for (const m of ["o1", "o3-mini", "o4-mini", "O1-preview"]) {
    const cap = capabilityForModel(m);
    assert.equal(cap.id, "reasoning_effort");
    assert.deepEqual(cap.tiers.map((t) => t.params.reasoning_effort), ["low", "medium", "high"]);
  }
});

test("capabilityForModel：Claude → thinking budget_tokens 档位", () => {
  const cap = capabilityForModel("claude-sonnet-4");
  assert.equal(cap.id, "thinking");
  const budgets = cap.tiers.map((t) => (t.params.thinking as { budget_tokens: number }).budget_tokens);
  assert.deepEqual(budgets, [4096, 16384, 32768]);
});

test("capabilityForModel：DeepSeek reasoner → 单档（模型自带推理链）", () => {
  const cap = capabilityForModel("deepseek-reasoner");
  assert.equal(cap.id, "deepseek_reasoner");
  assert.equal(cap.tiers.length, 1);
  assert.deepEqual(cap.tiers[0].params, {});
});

test("capabilityForModel：普通 chat 模型 → 温度档兜底（含 Ollama 本地名）", () => {
  for (const m of ["deepseek-chat", "gpt-4o-mini", "qwen2.5", "llama3"]) {
    const cap = capabilityForModel(m);
    assert.equal(cap.id, "temperature_only");
    assert.equal(cap.tiers.length, 3);
    // 档位映射到不同温度
    const temps = cap.tiers.map((t) => t.params.temperature as number);
    assert.deepEqual(temps, [0.2, 0.5, 0.8]);
  }
});

test("capabilityForModel：'gpt-4o-mini' 不误判为 o 系列（o 在 4 之后）", () => {
  assert.equal(capabilityForModel("gpt-4o-mini").id, "temperature_only");
});

test("defaultTier / tierById：取默认与按 id 取档；未知 id 回默认", () => {
  const cap = capabilityForModel("o3-mini");
  assert.equal(defaultTier(cap).id, "low");
  assert.equal(tierById(cap, "high").id, "high");
  assert.equal(tierById(cap, "bogus").id, "low"); // 未知回默认
  assert.equal(tierById(cap, null).id, "low"); // null 回默认
});

test("档位 hint 存在于首尾（更快/更细致类副标题）", () => {
  const cap = capabilityForModel("o3");
  assert.ok(cap.tiers[0].hint); // 轻度有副标题
  assert.equal(cap.tiers[1].hint, undefined); // 中档无
});
