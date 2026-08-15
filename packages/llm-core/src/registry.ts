/**
 * Provider 注册表（Vercel AI SDK createProviderRegistry 思想）——
 * 用 `providerId:modelId` 寻址，支持多 provider 混合、模型别名、默认 provider。
 */

import type { LLMProviderConfig } from "./types.ts";
import { LLMError } from "./types.ts";
import { callOpenAICompatible } from "./openai.ts";
import type { StructuredRequest } from "./types.ts";

/** 注册表：id → provider 配置。 */
export class LLMRegistry {
  private providers = new Map<string, LLMProviderConfig>();
  private defaultId: string | null = null;

  /** 注册一个 provider（重复 id 覆盖）。 */
  register(cfg: LLMProviderConfig): this {
    this.providers.set(cfg.id, cfg);
    if (!this.defaultId) this.defaultId = cfg.id;
    return this;
  }

  /** 设置默认 provider。 */
  setDefault(id: string): this {
    if (!this.providers.has(id)) throw new LLMError(`未注册的 provider: ${id}`);
    this.defaultId = id;
    return this;
  }

  /** 取 provider（支持 "id" 或 "id:model" 覆盖模型）。 */
  resolve(ref?: string): LLMProviderConfig {
    if (!ref) {
      if (!this.defaultId) throw new LLMError("尚未注册任何 LLM provider");
      return this.providers.get(this.defaultId)!;
    }
    const [id, model] = ref.split(":");
    const cfg = this.providers.get(id);
    if (!cfg) throw new LLMError(`未注册的 provider: ${id}`);
    return model ? { ...cfg, model } : cfg;
  }

  /** 是否已配置至少一个可用 provider。 */
  get available(): boolean {
    return this.providers.size > 0;
  }

  list(): LLMProviderConfig[] {
    return [...this.providers.values()];
  }

  /** 结构化调用（可指定 "providerId:modelId"，缺省用默认）。 */
  async structured<T>(req: StructuredRequest, ref?: string): Promise<T> {
    const cfg = this.resolve(ref);
    return callOpenAICompatible<T>(cfg, req);
  }
}

/** 从环境变量构造注册表（Node/CLI 用；浏览器不应直连，需经代理）。 */
export function registryFromEnv(env: Record<string, string | undefined>): LLMRegistry {
  const r = new LLMRegistry();
  // 通用：IMSKIN_LLM_BASE_URL / IMSKIN_LLM_API_KEY / IMSKIN_LLM_MODEL
  if (env.IMSKIN_LLM_BASE_URL && env.IMSKIN_LLM_MODEL) {
    r.register({
      id: "default",
      baseUrl: env.IMSKIN_LLM_BASE_URL,
      apiKey: env.IMSKIN_LLM_API_KEY,
      model: env.IMSKIN_LLM_MODEL,
    });
  }
  // OpenAI 直连
  if (env.OPENAI_API_KEY) {
    r.register({ id: "openai", baseUrl: "https://api.openai.com/v1", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL ?? "gpt-4o-mini" });
  }
  // Ollama 本地（无需 key）
  if (env.OLLAMA_HOST || env.IMSKIN_OLLAMA_MODEL) {
    r.register({
      id: "ollama",
      baseUrl: `${env.OLLAMA_HOST ?? "http://localhost:11434"}/v1`,
      apiKey: "ollama",
      model: env.IMSKIN_OLLAMA_MODEL ?? "qwen2.5",
    });
  }
  // DeepSeek
  if (env.DEEPSEEK_API_KEY) {
    r.register({ id: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL ?? "deepseek-chat" });
  }
  return r;
}
