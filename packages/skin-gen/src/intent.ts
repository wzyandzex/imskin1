/**
 * A1 意图理解（确定性骨架）：模糊想法 → DesignBrief + 克制式追问。
 *
 * 这是 A1 的**确定性实现**（零外部依赖、可测试），对应需求 FR-INPUT-2 / FR-BRIEF-2：
 * - 当"风格 / 配色 / 情绪"三者缺任意两项以上明确指向时，触发**一次只问一个**的追问；
 * - 能从文本推断的默认值**不问**，直接补全并标注为"推断"（inferredFields）；
 * - 用户可随时"你看着办"跳过，系统给出合理默认并保留推断标注。
 *
 * 诚实边界：真正的 LLM 语义理解（更细腻的风格/情绪识别）可后续接在
 * `analyzeIntent` 契约之后——只要返回同一 `IntentAnalysis` 形状，下游（追问卡片、
 * Brief 确认卡片、生成管线）完全不用改。见《市场调研与产品启示.md》§7。
 */

import type { DesignBrief } from "./spec.ts";

/** 一次追问：只问一个关键问题。 */
export interface ClarifyQuestion {
  /** 追问针对的维度。 */
  field: "styleKeywords" | "palette" | "mood";
  /** 问题文案（像聊天一样自然）。 */
  text: string;
  /** 可选的快捷选项（chips），用户也可自由输入。 */
  options: string[];
}

/** A1 分析产出。 */
export interface IntentAnalysis {
  /** 补全后的设计简报（含推断默认值）。 */
  brief: DesignBrief;
  /** 哪些字段是推断而非用户明确指定（前端高亮用）。 */
  inferredFields: string[];
  /** 是否需要一次克制式追问。 */
  needsClarification: boolean;
  /** 若要追问，只问这一个问题。 */
  question?: ClarifyQuestion;
}

// —— 词表（与 brief.ts 的映射词表呼应；A1 只负责"识别有没有明确指向"，具体落成 token 是 A2 的事）——

/** 情绪/氛围词：命中即认为"情绪"维度有明确指向。 */
const MOOD_WORDS = [
  "沉静内敛", "深邃神秘", "温暖治愈", "清新明亮", "甜美可爱", "清冷高级",
  "沉静", "内敛", "稳重", "深邃", "神秘", "清冷", "温暖", "治愈", "活泼", "明快", "明亮",
  "柔和", "安静", "高级", "复古", "文艺", "清新", "沉稳", "冷静", "热烈", "温柔",
];

/** 风格关键词：命中即认为"风格"维度有明确指向。 */
const STYLE_WORDS = [
  "极简", "简约", "水墨", "国潮", "国风", "中国风", "赛博", "科技", "可爱", "萌", "复古",
  "商务", "留白", "ins", "日系", "北欧", "工业", "蒸汽波", "像素", "手绘", "油画", "渐变",
  "玻璃拟态", "毛玻璃", "扁平", "立体", "金属", "哑光", "纸质感", "自然", "森林", "海洋",
  "星空", "暗夜", "护眼", "二次元", "动漫", "游戏", "运动", "奢华", "轻奢", "田园",
  // 颜色词也是风格的明确指向（"薄荷绿"本身就定了风格倾向）
  "薄荷", "樱花", "抹茶", "森系", "焦糖", "香槟", "月白", "天青", "藏蓝", "宝蓝", "墨黑", "雾霾蓝", "薰衣草", "香芋", "鹅黄", "柠檬", "玄青", "高级灰", "银灰", "焦糖色",
  "绿", "蓝", "紫", "粉", "橙", "红", "黄", "黑", "白", "灰", "棕", "金", "青",
];

/** 中文颜色词 → hex（用于从文本提取主色）。 */
const COLOR_WORDS: Record<string, string> = {
  红: "#d23b3b", 朱红: "#c0392b", 绯红: "#e74c3c", 粉: "#f2a7c3", 樱花粉: "#f6c6d8",
  橙: "#e8843c", 橘: "#e8843c", 暖阳橙: "#e8843c",
  黄: "#e6c14a", 柠檬黄: "#ead94c", 鹅黄: "#f2e394",
  绿: "#3faf7d", 薄荷绿: "#3faf8d", 抹茶绿: "#7fb069", 墨绿: "#2f5d50", 森绿: "#3d6b4f",
  青: "#3aa6a0", 天青: "#6fb7c9",
  蓝: "#4a90e2", 天蓝: "#5ab0f0", 藏蓝: "#2b3a67", 宝蓝: "#2f5fd0", 雾霾蓝: "#7d99b4",
  紫: "#7a5cff", 薰衣草紫: "#9b8cff", 香芋紫: "#b8a6d9",
  黑: "#1b1b21", 墨: "#2b2b33", 玄青: "#23232b",
  白: "#f6f8fb", 月白: "#eef2f7", 米白: "#f0ead6",
  灰: "#9aa3b2", 银灰: "#c9ccd4", 高级灰: "#8a8f99",
  棕: "#8b5a2b", 焦糖: "#a7673a", 咖: "#7a5a3a",
  金: "#d4af37", 香槟金: "#e6d3a3",
};

/** 材质词。 */
const MATERIAL_WORDS = ["玻璃拟态", "毛玻璃", "玻璃", "哑光", "金属", "纸质感", "磨砂", "绒面", "陶瓷", "木质"];

/** 推断默认主色：据风格/情绪词给一个和谐色（无显式颜色时的合理默认）。 */
const DEFAULT_PRIMARY_BY_HINT: Array<{ hint: string[]; color: string }> = [
  { hint: ["水墨", "国潮", "国风", "中国风", "复古", "墨"], color: "#2b2b33" },
  { hint: ["赛博", "科技", "暗夜", "星空"], color: "#7a5cff" },
  { hint: ["清新", "自然", "森林", "抹茶", "薄荷", "护眼"], color: "#3faf7d" },
  { hint: ["温暖", "治愈", "暖阳", "橙", "田园"], color: "#e8843c" },
  { hint: ["海洋", "天青", "蓝", "冷静"], color: "#4a90e2" },
  { hint: ["可爱", "萌", "粉", "樱花"], color: "#f2a7c3" },
  { hint: ["高级", "商务", "极简", "轻奢"], color: "#2b3a67" },
];

const DEFAULT_PRIMARY = "#4a90e2";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** 从文本提取显式颜色（#hex / rgb() / 中文颜色词）。 */
function extractPrimary(text: string): { color?: string; matched: boolean } {
  const hex = text.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  if (hex) return { color: `#${hex[1].toLowerCase()}`, matched: true };
  const rgb = text.match(/rgba?\(\s*(\d+)\s*[,，]\s*(\d+)\s*[,，]\s*(\d+)/);
  if (rgb) {
    const to = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
    return { color: `#${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`, matched: true };
  }
  // 中文颜色词（长词优先，避免"红"抢先于"朱红"）
  const keys = Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (text.includes(k)) return { color: COLOR_WORDS[k], matched: true };
  }
  return { matched: false };
}

function extractKeywords(text: string): string[] {
  // 去掉标点便于复合风格词匹配（"国潮水墨"被空格/逗号分开也应命中）
  const clean = text.replace(/[，,、;；。\s]/g, "");
  const hits = [...STYLE_WORDS].sort((a, b) => b.length - a.length).filter((w) => clean.includes(w));
  const parts = text
    .split(/[，,、;；/\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 6 && !/^#|rgb/i.test(s) && !COLOR_WORDS[s]);
  const out: string[] = [];
  for (const k of [...hits, ...parts]) if (!out.includes(k)) out.push(k);
  return out;
}

function extractMood(text: string): string | undefined {
  // 长词优先，避免"沉静"抢先于"沉静内敛"；去掉文本标点以匹配复合词
  const clean = text.replace(/[，,、;；。\s]/g, "");
  const hit = [...MOOD_WORDS].sort((a, b) => b.length - a.length).find((w) => clean.includes(w));
  return hit;
}

function extractMaterial(text: string): string | undefined {
  return MATERIAL_WORDS.find((w) => text.includes(w));
}

/** 推断一个和谐主色（无显式颜色时）。 */
function inferPrimary(text: string): string {
  for (const { hint, color } of DEFAULT_PRIMARY_BY_HINT) {
    if (hint.some((h) => text.includes(h))) return color;
  }
  return DEFAULT_PRIMARY;
}

/** 判断文本是否含颜色指向（显式颜色词或 hex/rgb）。区别于"提取出主色"——风格词里的颜色不算。 */
function hasColorReference(text: string): boolean {
  if (/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.test(text)) return true;
  if (/rgba?\(/.test(text)) return true;
  return Object.keys(COLOR_WORDS).some((k) => text.includes(k));
}

/**
 * 分析用户想法 → 设计简报 + 是否需一次追问。
 *
 * 判定"明确指向"三维度：风格(styleKeywords) / 配色(palette.primary) / 情绪(mood)。
 * 缺任意两项以上明确指向 → 触发一次追问（只问最关键的一个缺失维度）。
 * 能从文本推断的默认值直接补全并标注为推断（不再追问该维度）。
 */
export function analyzeIntent(text: string): IntentAnalysis {
  const raw = norm(text ?? "");
  const inferred: string[] = [];

  // 配色：只有"颜色指向"（hex/rgb/颜色词）才算配色维度的明确指向；风格词（如"水墨"）隐含颜色不算配色指向
  const colorRes = extractPrimary(raw);
  const hasColor = hasColorReference(raw);
  const primary = colorRes.color ?? inferPrimary(raw);
  if (!hasColor) inferred.push("palette.primary");

  // 风格
  const keywords = extractKeywords(raw);
  const hasStyle = keywords.length > 0;
  const styleKeywords = hasStyle ? keywords : ["简约"];
  if (!hasStyle) inferred.push("styleKeywords");

  // 情绪：显式词命中，或可从风格推断（如"水墨"→沉静），否则给默认并标注
  let mood = extractMood(raw);
  let moodInferred = false;
  if (!mood) {
    if (/(水墨|国潮|国风|复古|墨|沉静)/.test(raw)) mood = "沉静内敛";
    else if (/(赛博|科技|暗夜|星空|深邃|神秘)/.test(raw)) mood = "深邃神秘";
    else if (/(清新|自然|明亮|薄荷|森)/.test(raw)) mood = "清新明亮";
    else if (/(温暖|治愈|暖阳|橙|田园)/.test(raw)) mood = "温暖治愈";
    else if (/(可爱|萌|粉|樱花)/.test(raw)) mood = "甜美可爱";
    else mood = "清新明亮";
    moodInferred = true;
    inferred.push("mood");
  }
  const hasMood = !moodInferred; // 显式命中才算"明确指向"

  const materialDirection = extractMaterial(raw);
  if (!materialDirection) inferred.push("materialDirection");

  // 明确指向的维度计数
  const pointed = [hasStyle, hasColor, hasMood].filter(Boolean).length;
  const missing = 3 - pointed;
  const needsClarification = missing >= 2;

  let question: ClarifyQuestion | undefined;
  if (needsClarification) {
    // 只问最关键的一个缺失维度，优先级：风格 > 配色 > 情绪
    if (!hasStyle) {
      question = {
        field: "styleKeywords",
        text: "想往哪个风格方向走？",
        options: ["极简", "国潮水墨", "赛博科技", "可爱", "复古", "清新自然"],
      };
    } else if (!hasColor) {
      question = {
        field: "palette",
        text: "主色想用哪个色系？",
        options: ["薄荷绿", "天空蓝", "暖橙", "樱粉", "墨黑", "薰衣紫"],
      };
    } else {
      question = {
        field: "mood",
        text: "整体情绪想偏哪种？",
        options: ["沉静内敛", "清新明亮", "深邃神秘", "温暖治愈", "甜美可爱"],
      };
    }
  }

  const brief: DesignBrief = {
    styleKeywords,
    palette: { primary },
    mood,
    cornerRadius: "medium",
    materialDirection,
  };
  if (!/圆|角/.test(raw)) inferred.push("cornerRadius");

  return { brief, inferredFields: inferred, needsClarification, question };
}

/** 应用一次追问的回答，返回更新后的简报（该字段转为"用户明确指定"）。 */
export function refineBrief(brief: DesignBrief, field: ClarifyQuestion["field"], answer: string): DesignBrief {
  const a = (answer ?? "").trim();
  if (!a) return brief;
  if (field === "styleKeywords") {
    const kws = a.split(/[，,、;；/\s]+/).filter(Boolean);
    return { ...brief, styleKeywords: kws.length ? kws : brief.styleKeywords };
  }
  if (field === "palette") {
    const c = extractPrimary(a);
    return { ...brief, palette: { ...brief.palette, primary: c.color ?? COLOR_WORDS[a] ?? brief.palette.primary } };
  }
  // mood
  return { ...brief, mood: a };
}

/** 定稿：把推断字段标注写进简报（前端高亮 + 需求 FR-BRIEF-1 的 inferred_fields）。 */
export function finalizeBrief(brief: DesignBrief, inferredFields: string[]): DesignBrief {
  return { ...brief, inferredFields: [...inferredFields] };
}
