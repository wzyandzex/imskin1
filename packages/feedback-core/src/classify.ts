/**
 * A5 反馈分类（架构 §5.3）：把一句自然语言反馈归到五类之一，并给出命中的关键词与置信度。
 *
 * 做法是确定性关键词打分：每类维护一组触发词，命中数即得分，取最高分者为类型；
 * 全不命中时按"整体氛围"兜底到 style（自由文字反馈多是整体感受，架构 §5.2），并给低置信度。
 * 这是 A5 的确定性骨架，后续可在同一 Classification 契约后接 LLM 语义增强，不改下游。
 */

import type { FeedbackType, Classification } from "./types.ts";

/**
 * 各类型的触发关键词（中文口语为主）。命中越多越可信。
 * 注意：此处只做"类型判定"，粗粒度关键词即可；带极性的措辞消歧（"太活泼"其实是想更稳重）
 * 放在 applyToBrief 的 STYLE_RULES 里做，两者分工不同。
 */
const KEYWORDS: Record<FeedbackType, string[]> = {
  asset_param: [
    "字太小", "字太大", "太小", "太大", "字小", "字大", "字号", "字体",
    "颜色太深", "颜色太浅", "太深", "太浅", "太亮", "偏深", "偏浅", "偏亮", "颜色", "色号",
  ],
  layout: [
    "在上面", "在下面", "上面", "下面", "太挤", "排列", "位置", "对齐", "对不齐", "没对齐",
    "间距", "挤", "布局", "居中", "靠左", "靠右", "顺序", "偏左", "偏右", "偏上", "偏下",
  ],
  style: [
    "太活泼", "活泼", "稳重", "沉稳", "中国风", "国潮", "国风", "古典", "古风", "水墨", "书法",
    "风格", "氛围", "气质", "调性", "太花哨", "花哨", "简约", "极简", "高级感", "质感",
    "温暖", "清新", "科技感", "未来感", "可爱", "俏皮", "严肃", "正式", "成熟", "小清新", "轻奢",
  ],
  platform: [
    "百度", "搜狗", "这边", "那边", "这个平台", "另一端", "另一个平台", "平台", "两端", "一端",
  ],
  interaction: [
    "翻页", "卡顿", "卡", "没反馈", "无反馈", "没有反馈", "按下", "动效", "动画", "太慢", "慢",
    "延迟", "掉帧", "不流畅", "卡壳", "响应", "音效", "震动", "按键音", "弹跳", "过渡",
  ],
};

/**
 * 遍历/平局顺序：更"具体"的类型优先（platform 有具体平台名最具体，style 最兜底）。
 * 由于选取用严格 `>`，此顺序下同分时靠前者胜出。
 */
const PRIORITY: FeedbackType[] = ["platform", "interaction", "asset_param", "layout", "style"];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** 反馈分类：类型 + 命中关键词 + 置信度。 */
export function classifyFeedback(text: string): Classification {
  const t = text ?? "";

  // 各类命中的关键词
  const matched = new Map<FeedbackType, string[]>();
  for (const type of PRIORITY) {
    matched.set(type, KEYWORDS[type].filter((kw) => t.includes(kw)));
  }

  // 取最高分：按 PRIORITY 顺序 + 严格 `>`，同分时高优先类型胜出
  let topType: FeedbackType = "style";
  let topScore = 0;
  for (const type of PRIORITY) {
    const score = matched.get(type)!.length;
    if (score > topScore) {
      topScore = score;
      topType = type;
    }
  }

  // 兜底：无关键词命中 → 最可能是整体氛围类，低置信度（架构 §5.2 自由文字反馈多为整体感受）
  if (topScore === 0) {
    return { type: "style", hints: [], confidence: 0.2 };
  }

  // 次高分，用于置信度的"领先幅度"
  let runnerUp = 0;
  for (const type of PRIORITY) {
    if (type === topType) continue;
    runnerUp = Math.max(runnerUp, matched.get(type)!.length);
  }

  const confidence = clamp(
    0.55 + 0.12 * (topScore - 1) + 0.12 * (topScore - runnerUp),
    0.5,
    0.95,
  );
  return { type: topType, hints: matched.get(topType)!, confidence };
}
