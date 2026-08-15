import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { LLMRegistry, understandFeedback, generateImage, skinImagePrompt, LLMError } from "../src/index.ts";

function chatJson(obj: unknown, status = 200) {
  return mock.fn(async () => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }));
}
const chatResponse = (content: unknown) => ({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] });

// —— understandFeedback ——

test("understandFeedback：LLM 解析口语化反馈为结构化意图", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  mock.method(globalThis, "fetch", chatJson(chatResponse({ type: "asset_param", target: "候选栏", direction: "候选词字号调大", magnitude: "medium" })));
  const res = await understandFeedback("候选词看着有点费劲", r);
  assert.equal(res.fellBack, false);
  assert.equal(res.data!.type, "asset_param");
  assert.equal(res.data!.target, "候选栏");
  mock.restoreAll();
});

test("understandFeedback：无 provider → fellBack，data=null（调用方走确定性）", async () => {
  const r = new LLMRegistry();
  const res = await understandFeedback("候选词字太小", r);
  assert.equal(res.fellBack, true);
  assert.equal(res.data, null);
});

test("understandFeedback：返回非法 → fellBack", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  mock.method(globalThis, "fetch", chatJson(chatResponse({ type: " nonsense" })));
  const res = await understandFeedback("x", r);
  assert.equal(res.fellBack, true);
  assert.equal(res.data, null);
  mock.restoreAll();
});

// —— generateImage ——

test("generateImage：b64_json 返回 → 解出字节", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const b64 = Buffer.from(png).toString("base64");
  mock.method(globalThis, "fetch", chatJson({ data: [{ b64_json: b64 }] }));
  const img = await generateImage({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "dall-e-3" }, { prompt: "test" });
  assert.deepEqual([...img.bytes], [...png]);
  assert.equal(img.source, "b64");
  mock.restoreAll();
});

test("generateImage：url 返回 → 拉取字节", async () => {
  const png = new Uint8Array([1, 2, 3, 4]);
  const imgUrl = "https://cdn.x/img.png";
  mock.method(globalThis, "fetch", mock.fn(async (u: unknown) => {
    if (String(u).includes("images/generations")) {
      return new Response(JSON.stringify({ data: [{ url: imgUrl }] }), { status: 200 });
    }
    return new Response(png, { status: 200 });
  }));
  const img = await generateImage({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" }, { prompt: "p" });
  assert.deepEqual([...img.bytes], [...png]);
  assert.equal(img.source, "url");
  mock.restoreAll();
});

test("generateImage：HTTP 错误抛 LLMError（不产假图）", async () => {
  mock.method(globalThis, "fetch", chatJson({ error: { message: "bad key" } }, 401));
  await assert.rejects(generateImage({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" }, { prompt: "p" }), LLMError);
  mock.restoreAll();
});

test("skinImagePrompt：由设计意图构造英文提示词", () => {
  const p = skinImagePrompt({ styleKeywords: ["极简", "水墨"], mood: "沉静", primary: "#2b2b33" });
  assert.ok(p.includes("极简"));
  assert.ok(p.includes("#2b2b33"));
  assert.ok(p.includes("no text"));
});
