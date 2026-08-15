/**
 * OpenAI 兼容 provider —— 业界事实标准的实现。
 *
 * 任何兼容 OpenAI Chat Completions 的后端（OpenAI / DeepSeek / 通义 / Moonshot /
 * OpenRouter / vLLM / Ollama / LM Studio …）都可用 `base_url + api_key + model` 接入。
 * 结构化输出优先用 `response_format: { type: "json_schema" }`（strict），
 * 不支持 strict 的后端（如部分国产/Ollama）回退 `json_object` + prompt 内嵌 schema。
 */

import type { ChatMessage, LLMProviderConfig, StructuredRequest } from "./types.ts";
import { LLMError } from "./types.ts";

const DEFAULT_TIMEOUT = 30_000;

/** 组装请求体（chat.completions 格式）。 */
function buildBody(cfg: LLMProviderConfig, req: StructuredRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.3,
  };
  // 结构化输出：优先 json_schema（strict），否则 json_object + 在 system 里内嵌 schema。
  const schemaName = req.schemaName ?? "response";
  body.response_format = {
    type: "json_schema",
    json_schema: { name: schemaName, strict: true, schema: req.schema },
  };
  // 额外参数（reasoning_effort 等，按厂商/模型动态注入）
  if (req.extraBody) Object.assign(body, req.extraBody);
  return body;
}

/** 兼容后端的降级请求体（json_object 模式 + schema 内嵌进 system prompt）。 */
function buildFallbackBody(cfg: LLMProviderConfig, req: StructuredRequest): Record<string, unknown> {
  const schemaHint = `你必须只返回符合如下 JSON Schema 的 JSON 对象（不要输出任何额外文字/ markdown 围栏）：\n${JSON.stringify(req.schema)}`;
  const messages: ChatMessage[] = [
    { role: "system", content: schemaHint },
    ...req.messages,
  ];
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: req.temperature ?? 0.3,
    response_format: { type: "json_object" },
  };
  // 降级体也注入额外参数（reasoning_effort 等通常与 response_format 无关，可保留）
  if (req.extraBody) Object.assign(body, req.extraBody);
  return body;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function post(baseUrl: string, path: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<ChatCompletionResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: ChatCompletionResponse = {};
    try {
      json = JSON.parse(text) as ChatCompletionResponse;
    } catch {
      /* 非 JSON 响应 */
    }
    if (!res.ok) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      // 401/403 不可重试；429/5xx 可重试
      const retryable = res.status === 429 || res.status >= 500;
      throw new LLMError(`LLM 请求失败: ${msg}`, retryable);
    }
    return json;
  } catch (e) {
    if (e instanceof LLMError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new LLMError("LLM 请求超时", true);
    throw new LLMError(`LLM 网络错误: ${e instanceof Error ? e.message : String(e)}`, true);
  } finally {
    clearTimeout(timer);
  }
}

/** 从响应文本提取 JSON（容错 markdown 围栏 / 前后杂字）。 */
function extractJson(content: string): unknown {
  const t = content.trim();
  // 去 ```json ... ``` 围栏
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const inner = fenced ? fenced[1] : t;
  // 找第一个 { 到最后一个 }
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new LLMError("LLM 返回不含 JSON 对象");
  try {
    return JSON.parse(inner.slice(start, end + 1));
  } catch {
    throw new LLMError("LLM 返回的 JSON 无法解析");
  }
}

/**
 * 调用 OpenAI 兼容后端的结构化输出。
 * 先试 strict json_schema；若后端报"不支持 response_format/json_schema"，自动回退 json_object 模式。
 */
export async function callOpenAICompatible<T>(
  cfg: LLMProviderConfig,
  req: StructuredRequest,
): Promise<T> {
  const timeoutMs = req.timeoutMs ?? cfg.timeoutMs ?? DEFAULT_TIMEOUT;
  const headers: Record<string, string> = { ...(cfg.headers ?? {}) };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  // 第一次：strict json_schema
  try {
    const res = await post(cfg.baseUrl, "/chat/completions", headers, buildBody(cfg, req), timeoutMs);
    const content = res.choices?.[0]?.message?.content ?? "";
    return extractJson(content) as T;
  } catch (e) {
    // 若是"不支持该参数"类错误（4xx 非 401/403），回退 json_object 模式重试一次
    const msg = e instanceof Error ? e.message : "";
    const unsupported = /response_format|json_schema|not supported|invalid.*param/i.test(msg);
    const authFail = /401|403|unauthorized|invalid.*key/i.test(msg);
    if (!unsupported || authFail) throw e;
  }
  // 第二次：json_object + schema 内嵌
  const res2 = await post(cfg.baseUrl, "/chat/completions", headers, buildFallbackBody(cfg, req), timeoutMs);
  const content2 = res2.choices?.[0]?.message?.content ?? "";
  return extractJson(content2) as T;
}
