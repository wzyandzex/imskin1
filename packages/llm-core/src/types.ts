/**
 * LLM 接入层（@imskin/llm-core）—— 用户可接入自己的模型。
 *
 * 设计对齐业界最优实践（见《市场调研与产品启示.md》与架构文档）：
 *
 * - **OpenAI 兼容为通用语言**（LiteLLM/Ollama/OpenRouter/国产大模型的共同事实标准）：
 *   任何 provider 只需 `base_url + api_key + model` 三元组即可接入。
 * - **Provider 注册表**（Vercel AI SDK 的 createProviderRegistry 思想）：
 *   用 `providerId:modelId` 字符串寻址，支持多 provider 混合、别名、白名单。
 * - **结构化输出**（OpenAI structured outputs / Instructor 思想）：
 *   用 JSON schema 约束 LLM 返回可靠的结构化数据（我们要的是 DesignBrief JSON）。
 * - **降级链（fallback）**：LLM 失败/超时/返回非法 → 自动回退到确定性启发式（skin-gen/intent.ts），
 *   保证"无 key / 离线 / 本地模型"也能用（诚实边界：不静默失败，降级会记录 provenance）。
 * - **密钥安全**：api_key 由调用方注入（环境变量/配置），前端直连需经后端代理（避免 CORS/key 泄露）。
 *
 * 本包零第三方依赖（Node ≥22 原生 fetch）；可在 Node（CLI/服务端）与浏览器（经代理）运行。
 */

export type { DesignBrief } from "@imskin/skin-gen";

/** 一个 LLM 提供方的配置（OpenAI 兼容三元组）。 */
export interface LLMProviderConfig {
  /** provider 标识（注册表寻址用），如 "openai" / "ollama" / "deepseek"。 */
  id: string;
  /** OpenAI 兼容 base_url，如 "https://api.openai.com/v1" 或 "http://localhost:11434/v1"。 */
  baseUrl: string;
  /** API key（Ollama 可填任意值）。 */
  apiKey?: string;
  /** 默认模型名。 */
  model: string;
  /** 请求超时毫秒（默认 30000）。 */
  timeoutMs?: number;
  /** 额外请求头。 */
  headers?: Record<string, string>;
}

/** 多模态内容片段（OpenAI vision 事实标准：text / image_url）。 */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** 聊天消息（OpenAI 格式）；content 为字符串或多模态片段数组。 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/** 结构化输出请求（JSON schema 约束）。 */
export interface StructuredRequest {
  messages: ChatMessage[];
  /** JSON Schema（draft-07 子集），约束返回结构。 */
  schema: Record<string, unknown>;
  /** schema 名称（OpenAI json_schema 用）。 */
  schemaName?: string;
  /** 温度（默认 0.3，结构化任务宜低）。 */
  temperature?: number;
  /** 本次请求覆盖超时。 */
  timeoutMs?: number;
  /** 额外请求体字段（如 reasoning_effort；按厂商/模型动态注入）。 */
  extraBody?: Record<string, unknown>;
}

/** 一次调用的结果（含溯源）。 */
export interface LLMResult<T> {
  /** 解析后的结构化数据；降级时为确定性回退产物。 */
  data: T;
  /** 是否走了降级回退（true = LLM 失败，用了确定性启发式）。 */
  fellBack: boolean;
  /** 溯源：provider/model/耗时/是否降级/降级原因。 */
  provenance: {
    provider: string;
    model: string;
    ms: number;
    fellBack: boolean;
    reason?: string;
  };
}

/** LLM 调用错误（携带是否可降级）。 */
export class LLMError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = "LLMError";
    this.retryable = retryable;
  }
}
