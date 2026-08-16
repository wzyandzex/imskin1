/**
 * SEC-002 URL 守卫测试：边界规则 + 集成（fetch 拦截前置）。
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { assertSafeBaseUrl, isPrivateOrMetadataHost, callOpenAICompatible } from "../src/index.ts";
import { LLMError } from "../src/index.ts";

test("assertSafeBaseUrl：https 公网放行", () => {
  assert.doesNotThrow(() => assertSafeBaseUrl("https://api.deepseek.com/v1"));
  assert.doesNotThrow(() => assertSafeBaseUrl("https://openrouter.ai/api"));
});

test("assertSafeBaseUrl：http 仅限回环（本机 Ollama/LM Studio 场景）", () => {
  assert.doesNotThrow(() => assertSafeBaseUrl("http://localhost:11434/v1"));
  assert.doesNotThrow(() => assertSafeBaseUrl("http://127.0.0.1:1234/v1"));
  assert.throws(() => assertSafeBaseUrl("http://192.168.1.5:8080/v1"), /仅允许本机回环/);
  assert.throws(() => assertSafeBaseUrl("http://api.example.com/v1"), /仅允许本机回环/);
});

test("assertSafeBaseUrl：内网/保留/metadata IP 字面量一律拒绝（含 https）", () => {
  for (const u of [
    "https://10.0.0.1/v1",
    "https://172.16.0.1/v1",
    "https://172.31.255.255/v1",
    "https://192.168.0.10/v1",
    "https://169.254.169.254/latest/meta-data/", // 云 metadata
    "https://100.64.0.1/v1",
    "https://0.0.0.0/v1",
    "https://[fd00::1]/v1",
    "https://[fe80::1]/v1",
  ]) {
    assert.throws(() => assertSafeBaseUrl(u), /内网|SSRF/, u);
  }
});

test("assertSafeBaseUrl：非法 URL / 非法协议拒绝", () => {
  assert.throws(() => assertSafeBaseUrl("not a url"), /地址非法/);
  assert.throws(() => assertSafeBaseUrl("ftp://example.com/x"), /协议不允许/);
  assert.throws(() => assertSafeBaseUrl("file:///etc/passwd"), /协议不允许/);
});

test("isPrivateOrMetadataHost：判定正确", () => {
  assert.equal(isPrivateOrMetadataHost("169.254.169.254"), true);
  assert.equal(isPrivateOrMetadataHost("8.8.8.8"), false);
  assert.equal(isPrivateOrMetadataHost("[fd12::1]"), true);
  assert.equal(isPrivateOrMetadataHost("api.openai.com"), false);
});

test("SEC-002 集成：不安全 baseUrl 在 fetch 前被拒（不发任何网络请求）", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("不应发起请求");
  });
  try {
    await assert.rejects(
      callOpenAICompatible(
        { id: "evil", baseUrl: "http://169.254.169.254/v1", apiKey: "x", model: "m" },
        { messages: [{ role: "user", content: "hi" }], schema: { type: "object" } },
      ),
      (e: unknown) => e instanceof LLMError && !e.retryable,
    );
    assert.equal(fetchMock.mock.callCount(), 0); // 请求前拦截
  } finally {
    fetchMock.mock.restore();
  }
});
