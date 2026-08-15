/**
 * A1 意图理解的 LLM 增强 + 降级链。
 *
 * 设计：LLM 负责把模糊想法更细腻地解析成 DesignBrief（风格/配色/情绪/材质），
 * 用 JSON schema 约束结构化输出；任何失败（无 key / 超时 / 返回非法）自动回退到
 * skin-gen 的确定性 `analyzeIntent`，保证离线/无 key/本地模型也能用（诚实降级，记录溯源）。
 */

import { analyzeIntent, type DesignBrief } from "@imskin/skin-gen";
import type { LLMRegistry } from "./registry.ts";
import type { ChatMessage, LLMResult } from "./types.ts";

/** DesignBrief 的 JSON Schema（结构化输出约束）。 */
const BRIEF_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    styleKeywords: { type: "array", items: { type: "string" }, description: "风格关键词，如 极简/水墨/赛博" },
    palette: {
      type: "object",
      additionalProperties: false,
      properties: {
        primary: { type: "string", description: "主色 #rrggbb" },
        accent: { type: "string", description: "点缀色 #rrggbb（可选）" },
        background: { type: "string", description: "背景色 #rrggbb（可选）" },
      },
      required: ["primary"],
    },
    mood: { type: "string", description: "情绪基调，如 沉静内敛 / 清新明亮" },
    cornerRadius: { type: "string", enum: ["small", "medium", "large"] },
    materialDirection: { type: "string", description: "材质方向，如 玻璃拟态 / 哑光纸质感（可选）" },
  },
  required: ["styleKeywords", "palette", "mood"],
};

const SYSTEM = `你是输入法皮肤设计助手。把用户的模糊想法解析成结构化设计简报（DesignBrief）。
要求：
- styleKeywords 提取 1~4 个风格关键词；
- palette.primary 给出最贴切的十六进制主色；用户没提颜色则据风格/情绪推断一个和谐色；
- mood 用简洁中文描述情绪基调；
- cornerRadius 据风格判断（圆润可爱→large，硬朗科技→small，否则 medium）；
- 只返回 JSON，不要额外文字。`;

/** 附带参考图/视频关键帧时追加的视觉特征提取指令（FR-INPUT-1 AC2/AC3）。 */
const SYSTEM_REF = `
用户附带了参考图（可能含视频关键帧）。请从图中提取视觉特征并融入简报：
- 主色调 → palette（primary 取画面主导色，accent 取点缀色，background 取背景色）；
- 材质倾向（如玻璃、纸感、金属）→ materialDirection；
- 圆角程度（画面元素圆润/硬朗）→ cornerRadius；
- 构图密度与字重倾向 → 融入 styleKeywords（如"留白""厚重"）；
- 文字想法与图片冲突时，以文字为准。`;

/** 校验 LLM 返回的 brief 是否结构合法（不满足则视为失败，走降级）。 */
function validBrief(o: unknown): o is DesignBrief {
  if (typeof o !== "object" || o === null) return false;
  const b = o as Partial<DesignBrief>;
  if (!Array.isArray(b.styleKeywords) || b.styleKeywords.length === 0) return false;
  if (typeof b.palette?.primary !== "string" || !/^#[0-9a-fA-F]{3,6}$/.test(b.palette.primary)) return false;
  return true;
}

/**
 * 用 LLM 增强意图理解；失败自动降级到确定性启发式。
 * @param text 用户的模糊想法
 * @param registry LLM 注册表（无可用 provider 时直接降级）
 * @param ref 可选 "providerId:modelId"
 * @param opts.images 参考图/视频关键帧（data URL 或 http URL），走多模态消息（FR-INPUT-1）
 */
export async function understandIntent(
  text: string,
  registry: LLMRegistry,
  ref?: string,
  opts?: { images?: string[]; extraBody?: Record<string, unknown> },
): Promise<LLMResult<DesignBrief>> {
  const start = Date.now();
  const fallback = (): LLMResult<DesignBrief> => {
    const det = analyzeIntent(text);
    return {
      data: det.brief,
      fellBack: true,
      provenance: { provider: "deterministic", model: "heuristic", ms: Date.now() - start, fellBack: true, reason: "no-llm-or-error" },
    };
  };

  if (!registry.available) return fallback();

  const cfg = registry.resolve(ref);
  const images = opts?.images ?? [];
  const messages: ChatMessage[] = images.length > 0
    ? [
        { role: "system", content: SYSTEM + SYSTEM_REF },
        { role: "user", content: [{ type: "text", text }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))] },
      ]
    : [{ role: "system", content: SYSTEM }, { role: "user", content: text }];
  try {
    const brief = await registry.structured<DesignBrief>(
      { messages, schema: BRIEF_SCHEMA, schemaName: "DesignBrief", extraBody: opts?.extraBody },
      ref,
    );
    if (!validBrief(brief)) {
      return { data: analyzeIntent(text).brief, fellBack: true, provenance: { provider: cfg.id, model: cfg.model, ms: Date.now() - start, fellBack: true, reason: "invalid-json" } };
    }
    return { data: brief, fellBack: false, provenance: { provider: cfg.id, model: cfg.model, ms: Date.now() - start, fellBack: false } };
  } catch (e) {
    return {
      data: analyzeIntent(text).brief,
      fellBack: true,
      provenance: { provider: cfg.id, model: cfg.model, ms: Date.now() - start, fellBack: true, reason: e instanceof Error ? e.message : String(e) },
    };
  }
}
