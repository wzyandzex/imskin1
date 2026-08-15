/**
 * 推理强度档位（按厂商/模型动态，对齐 Codex/Claude/DeepSeek/OpenAI 各家实际支持的参数）。
 *
 * 设计：每个"能力"描述一种该厂商/模型支持的推理控制方式，
 * 每种能力有若干档位，每档映射成注入请求体（extraBody）的参数。
 * 用户在模型切换器里选档；不同模型能选的档不同（OpenAI o-series 支持 reasoning_effort，
 * DeepSeek 支持 deepseek-reasoner 的链长，Claude 支持 thinking，普通 chat 模型只有温度档）。
 */

export interface ReasoningTier {
  /** 档位 id。 */
  id: string;
  /** 显示名（如 轻度 / 中 / 高 / 极高）。 */
  label: string;
  /** 副标题（灰色小字，如"更快" / "更深但更慢"）。 */
  hint?: string;
  /** 注入到请求体的额外参数（如 { reasoning_effort: "low" }）。 */
  params: Record<string, unknown>;
}

export interface ReasoningCapability {
  /** 能力 id（如 "reasoning_effort" / "thinking" / "temperature_only"）。 */
  id: string;
  /** 能力显示名（如 "推理强度"）。 */
  label: string;
  /** 该能力下的可选档位。 */
  tiers: ReasoningTier[];
}

/** 通用：仅靠温度控制（任何 chat 模型都可用，兜底能力）。 */
const TEMP_ONLY: ReasoningCapability = {
  id: "temperature_only",
  label: "推理强度",
  tiers: [
    { id: "light", label: "轻度", hint: "更快", params: { temperature: 0.2 } },
    { id: "medium", label: "中", params: { temperature: 0.5 } },
    { id: "high", label: "高", hint: "更细致", params: { temperature: 0.8 } },
  ],
};

/** OpenAI o-series / 兼容 reasoning_effort 参数的模型（o1/o3/o4-mini/部分聚合服务）。 */
const OPENAI_REASONING: ReasoningCapability = {
  id: "reasoning_effort",
  label: "推理强度",
  tiers: [
    { id: "low", label: "轻度", hint: "更快", params: { reasoning_effort: "low" } },
    { id: "medium", label: "中", params: { reasoning_effort: "medium" } },
    { id: "high", label: "高", params: { reasoning_effort: "high" } },
  ],
};

/** Claude thinking（extended thinking）—— budget_tokens 档位。 */
const CLAUDE_THINKING: ReasoningCapability = {
  id: "thinking",
  label: "推理强度",
  tiers: [
    { id: "light", label: "轻度", hint: "更快", params: { thinking: { type: "enabled", budget_tokens: 4096 } } },
    { id: "medium", label: "中", params: { thinking: { type: "enabled", budget_tokens: 16384 } } },
    { id: "high", label: "高", hint: "更深但更慢", params: { thinking: { type: "enabled", budget_tokens: 32768 } } },
  ],
};

/** DeepSeek-reasoner：靠选模型本身控制推理，无额外参数；给一个"默认"档即可。 */
const DEEPSEEK_REASONER: ReasoningCapability = {
  id: "deepseek_reasoner",
  label: "推理强度",
  tiers: [
    { id: "default", label: "默认", hint: "deepseek-reasoner 自带推理链", params: {} },
  ],
};

/**
 * 按模型名推断它支持的推理能力。
 * 规则按模型名前缀/关键字匹配——OpenAI o 系列、Claude、DeepSeek-reasoner 各自识别；
 * 其余（含 Ollama 本地模型）回退到温度档。
 */
export function capabilityForModel(model: string): ReasoningCapability {
  const m = model.toLowerCase();
  if (/^o[1-4]|o1-|o3-|o4-mini|reasoning/.test(m)) return OPENAI_REASONING;
  if (/claude/.test(m)) return CLAUDE_THINKING;
  if (/deepseek-reasoner|deepseek-r1/.test(m)) return DEEPSEEK_REASONER;
  return TEMP_ONLY;
}

/** 某能力的默认档（第一个）。 */
export function defaultTier(cap: ReasoningCapability): ReasoningTier {
  return cap.tiers[0];
}

/** 按 id 取档位。 */
export function tierById(cap: ReasoningCapability, id: string | null | undefined): ReasoningTier {
  if (!id) return defaultTier(cap);
  return cap.tiers.find((t) => t.id === id) ?? defaultTier(cap);
}
