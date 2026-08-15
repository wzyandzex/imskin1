/**
 * A5 反馈理解的 LLM 增强 + 降级链。
 *
 * 确定性 classifyFeedback 只能匹配预设关键词（"字太小/太深/稳重"），对口语化、
 * 复合、隐晦的反馈（"感觉有点廉价""想要那种夕阳打在键盘上的感觉"）束手无策。
 * LLM 把反馈语义解析为结构化意图（分类 + 目标元素 + 调整方向 + 幅度），
 * 失败自动回退到确定性分类，保证离线/无 key 可用（诚实降级，记 provenance）。
 */

import type { LLMRegistry } from "./registry.ts";
import type { LLMResult } from "./types.ts";

/** LLM 解析出的反馈意图（比确定性分类更细）。 */
export interface FeedbackIntent {
  /** 反馈类型（对齐 feedback-core 的五类）。 */
  type: "asset_param" | "layout" | "style" | "platform" | "interaction";
  /** 目标元素（如"候选栏/按键/整体"），供定向修改。 */
  target?: string;
  /** 调整方向的自然语言（如"字号调大""颜色调浅""更稳重"），供 apply 层/LLM 直接改 spec。 */
  direction: string;
  /** 幅度（small/medium/large），供档位化修改。 */
  magnitude?: "small" | "medium" | "large";
  /** 平台（platform 类时）：sogou/baidu。 */
  platform?: "sogou" | "baidu";
}

const INTENT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["asset_param", "layout", "style", "platform", "interaction"], description: "反馈类型" },
    target: { type: "string", description: "目标元素：候选栏/按键/键盘背景/整体/选中态 等" },
    direction: { type: "string", description: "具体调整方向，如「候选词字号调大」「按键颜色调浅」" },
    magnitude: { type: "string", enum: ["small", "medium", "large"], description: "调整幅度" },
    platform: { type: "string", enum: ["sogou", "baidu"], description: "平台类反馈的平台" },
  },
  required: ["type", "direction"],
};

const SYSTEM = `你是输入法皮肤的反馈解析助手。把用户的一句反馈解析成结构化意图。
分类规则：
- asset_param：具体参数（字号、颜色深浅、字体、圆角）
- layout：布局/结构（位置、对齐、间距、排列）
- style：整体风格/氛围（活泼↔稳重、中国风、更高级）
- platform：平台特定（只百度/只搜狗某一端的问题）
- interaction：功能/交互（翻页慢、按下没反馈、动效、音效）
target 给出反馈指向的界面元素（候选栏/按键/键盘背景/候选选中态/整体）。
direction 用一句可操作的话描述要怎么改。只返回 JSON。`;

function validIntent(o: unknown): o is FeedbackIntent {
  if (typeof o !== "object" || o === null) return false;
  const i = o as Partial<FeedbackIntent>;
  const types = ["asset_param", "layout", "style", "platform", "interaction"];
  return typeof i.type === "string" && types.includes(i.type) && typeof i.direction === "string" && i.direction.length > 0;
}

/**
 * 用 LLM 解析反馈意图；失败返回 null（调用方回退到确定性 classifyFeedback）。
 * 返回 LLMResult 以携带 provenance；fellBack=true 表示应走确定性。
 */
export async function understandFeedback(
  text: string,
  registry: LLMRegistry,
  ref?: string,
  opts?: { extraBody?: Record<string, unknown> },
): Promise<LLMResult<FeedbackIntent | null>> {
  const start = Date.now();
  const fallback = (reason: string): LLMResult<null> => ({
    data: null,
    fellBack: true,
    provenance: { provider: "deterministic", model: "keyword", ms: Date.now() - start, fellBack: true, reason },
  });

  if (!registry.available) return fallback("no-llm");

  const cfg = registry.resolve(ref);
  try {
    const intent = await registry.structured<FeedbackIntent>(
      { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }], schema: INTENT_SCHEMA, schemaName: "FeedbackIntent", extraBody: opts?.extraBody },
      ref,
    );
    if (!validIntent(intent)) return fallback("invalid-json");
    return { data: intent, fellBack: false, provenance: { provider: cfg.id, model: cfg.model, ms: Date.now() - start, fellBack: false } };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : String(e));
  }
}
