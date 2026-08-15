/**
 * A5 反馈路由（架构 §5.3 表格）：把反馈类型映射到"从管线哪一层重跑"及受影响范围。
 * 只重跑受影响节点，避免"一句话反馈=全部重来"。
 */

import type { FeedbackType, RouteResult } from "./types.ts";

/** 从 hints 里认出被点名的平台，用于平台类反馈"写明平台"（scope）。 */
function platformName(hints: string[]): string {
  const has = (kw: string) => hints.some((h) => h.includes(kw));
  const baidu = has("百度");
  const sogou = has("搜狗");
  if (baidu && sogou) return "百度/搜狗";
  if (baidu) return "百度";
  if (sogou) return "搜狗";
  return "对应（搜狗/百度）";
}

/**
 * 反馈类型 → 重跑路由。
 *
 * PROVISIONAL（待核实）：任务书要求平台类"scope 写明平台"，但给定签名 routeFeedback(t) 只拿到
 * 类型、拿不到原文，无法据文识别平台。此处新增**可选** hints 形参（不破坏 routeFeedback(t) 调用），
 * 由 classifyFeedback 产出的 hints 透传具体平台名；不传 hints 时退化为通用平台描述。
 */
export function routeFeedback(t: FeedbackType, hints: string[] = []): RouteResult {
  switch (t) {
    case "asset_param":
      return {
        rerunFrom: "A3",
        scope: "改对应设计 token，只重跑 A3 受影响资产 + A4 对应平台打包",
      };
    case "layout":
      return {
        rerunFrom: "A2",
        scope: "回 A2 调结构参数，重跑受影响资产",
      };
    case "style":
      return {
        rerunFrom: "A1",
        scope: "回 A1 更新风格关键词/情绪，触发更大范围重生成，但保留已获正向反馈的元素",
      };
    case "platform":
      return {
        rerunFrom: "A3-platform",
        scope: `只路由 ${platformName(hints)} 平台适配层（A3 适配 + A4 对应分支），另一平台不受影响`,
      };
    case "interaction":
      return {
        rerunFrom: "interaction",
        scope: "路由到预览引擎交互参数层，只调动效时序参数，通常无需重新生成资产",
      };
  }
}
