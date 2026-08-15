import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { LLMRegistry, understandIntent, LLMError, callOpenAICompatible } from "../src/index.ts";

/** 构造一个返回指定 JSON 的 mock fetch。 */
function mockFetchJson(obj: unknown, status = 200) {
  return mock.fn(async () => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }));
}

const okBrief = {
  styleKeywords: ["极简", "水墨"],
  palette: { primary: "#2b2b33" },
  mood: "沉静内敛",
  cornerRadius: "medium",
};

function chatResponse(content: unknown) {
  return { choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] };
}

test("registry：注册/解析/默认/别名 id:model", () => {
  const r = new LLMRegistry();
  r.register({ id: "openai", baseUrl: "https://a/v1", apiKey: "k", model: "gpt-4o-mini" });
  r.register({ id: "ollama", baseUrl: "http://localhost:11434/v1", apiKey: "ollama", model: "qwen2.5" });
  assert.equal(r.available, true);
  assert.equal(r.resolve().id, "openai"); // 首个注册为默认
  assert.equal(r.resolve("ollama").model, "qwen2.5");
  assert.equal(r.resolve("ollama:llama3").model, "llama3"); // 别名覆盖模型
  r.setDefault("ollama");
  assert.equal(r.resolve().id, "ollama");
  assert.throws(() => r.resolve("nope"), LLMError);
});

test("understandIntent：LLM 成功返回合法 brief → 用之（不降级）", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  mock.method(globalThis, "fetch", mockFetchJson(chatResponse(okBrief)));
  const res = await understandIntent("想要水墨风", r);
  assert.equal(res.fellBack, false);
  assert.deepEqual(res.data.styleKeywords, ["极简", "水墨"]);
  assert.equal(res.data.palette.primary, "#2b2b33");
  assert.equal(res.provenance.provider, "t");
  mock.restoreAll();
});

test("understandIntent：无 provider → 降级到确定性启发式", async () => {
  const r = new LLMRegistry(); // 空
  const res = await understandIntent("国潮水墨风格，主色墨黑 #2b2b33，情绪沉静内敛", r);
  assert.equal(res.fellBack, true);
  assert.equal(res.provenance.provider, "deterministic");
  // 确定性产物正确
  assert.equal(res.data.palette.primary, "#2b2b33");
});

test("understandIntent：LLM 返回非法 JSON → 降级", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  mock.method(globalThis, "fetch", mockFetchJson(chatResponse("这不是JSON")));
  const res = await understandIntent("极简", r);
  assert.equal(res.fellBack, true);
  assert.equal(res.provenance.reason !== undefined, true);
  mock.restoreAll();
});

test("understandIntent：LLM 返回结构不合法（缺 primary）→ 降级", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  mock.method(globalThis, "fetch", mockFetchJson(chatResponse({ styleKeywords: ["x"], palette: {} })));
  const res = await understandIntent("极简", r);
  assert.equal(res.fellBack, true);
  mock.restoreAll();
});

test("understandIntent：网络错误/超时 → 降级不抛", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m", timeoutMs: 50 });
  mock.method(globalThis, "fetch", mock.fn(async () => { throw new Error("ECONNREFUSED"); }));
  const res = await understandIntent("极简", r);
  assert.equal(res.fellBack, true);
  mock.restoreAll();
});

test("callOpenAICompatible：strict 不被支持时自动回退 json_object", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", mock.fn(async (_u: unknown, init?: { body?: string }) => {
    calls++;
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (calls === 1) {
      // 第一次 strict json_schema → 报不支持
      assert.equal((body.response_format as { type: string }).type, "json_schema");
      return new Response(JSON.stringify({ error: { message: "response_format json_schema not supported" } }), { status: 400 });
    }
    // 第二次 json_object
    assert.equal((body.response_format as { type: string }).type, "json_object");
    return new Response(JSON.stringify(chatResponse(okBrief)), { status: 200 });
  }));
  const out = await callOpenAICompatible<typeof okBrief>(
    { id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" },
    { messages: [{ role: "user", content: "hi" }], schema: { type: "object" } },
  );
  assert.equal(out.palette.primary, "#2b2b33");
  assert.equal(calls, 2);
  mock.restoreAll();
});

test("callOpenAICompatible：提取带 markdown 围栏的 JSON", async () => {
  mock.method(globalThis, "fetch", mockFetchJson(chatResponse("```json\n" + JSON.stringify(okBrief) + "\n```")));
  const out = await callOpenAICompatible<typeof okBrief>(
    { id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" },
    { messages: [{ role: "user", content: "hi" }], schema: { type: "object" } },
  );
  assert.equal(out.mood, "沉静内敛");
  mock.restoreAll();
});

test("understandIntent：带参考图 → 组装多模态 user 消息（text + image_url）", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  let sentBody: { messages?: Array<{ role: string; content: unknown }> } = {};
  mock.method(globalThis, "fetch", mock.fn(async (_u: unknown, init?: { body?: string }) => {
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify(chatResponse(okBrief)), { status: 200 });
  }));
  const dataUrl = "data:image/jpeg;base64,abc123";
  const res = await understandIntent("像这张图的感觉", r, undefined, { images: [dataUrl] });
  assert.equal(res.fellBack, false);
  const user = sentBody.messages?.find((m) => m.role === "user");
  assert.ok(Array.isArray(user?.content));
  const parts = user!.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
  assert.equal(parts[0].type, "text");
  assert.equal(parts[0].text, "像这张图的感觉");
  assert.equal(parts[1].type, "image_url");
  assert.equal(parts[1].image_url?.url, dataUrl);
  // system prompt 含参考图特征提取指令
  const sys = sentBody.messages?.find((m) => m.role === "system");
  assert.match(String(sys?.content), /参考图/);
  mock.restoreAll();
});

test("understandIntent：带参考图但 LLM 失败 → 仍降级到确定性（不抛）", async () => {
  const r = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  mock.method(globalThis, "fetch", mock.fn(async () => { throw new Error("ECONNREFUSED"); }));
  const res = await understandIntent("极简", r, undefined, { images: ["data:image/jpeg;base64,x"] });
  assert.equal(res.fellBack, true);
  mock.restoreAll();
});

test("callOpenAICompatible：401 认证失败不降级重试（直接抛 LLMError）", async () => {
  mock.method(globalThis, "fetch", mockFetchJson({ error: { message: "unauthorized invalid key" } }, 401));
  await assert.rejects(
    callOpenAICompatible({ id: "t", baseUrl: "https://x/v1", apiKey: "bad", model: "m" }, { messages: [], schema: {} }),
    LLMError,
  );
  mock.restoreAll();
});
