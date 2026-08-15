/**
 * A5 定向最小修改（架构 §5.4）：据一句反馈只改受影响字段，其余**深拷贝后保持完全不变**。
 *
 * - applyToSpec 处理"具体资产参数"类（字号 / 颜色深浅）——改 VisualSpec 的对应 token。
 * - applyToBrief 处理"整体风格/氛围"类——调 DesignBrief 的 mood / styleKeywords。
 *
 * 两者都先 structuredClone 深拷贝入参，绝不原地修改调用方对象（变更范围最小化）。
 * 特别注意：briefToSpec 让 keyboard.font 与 candidateBar.font 共享同一对象，structuredClone
 * 会**保留这层共享**；因此改字号时用"重建 font 对象再赋值"而非 `font.size += n`，
 * 否则会连带改到另一侧。
 */

import type { DesignBrief, VisualSpec } from "@imskin/skin-gen";
import { lighten, darken } from "@imskin/skin-gen";

/**
 * 颜色一档：提亮/压暗的单步幅度（与 brief.ts 的微调量级 0.06~0.12 一致，用户可感但不激进）。
 * PROVISIONAL（待核实）："一档"的确切步长任务书未给定，0.12 为暂定值，可据真实预览观感再校准。
 */
export const COLOR_STEP = 0.12;
/** 字号一档 = 2px。 */
export const FONT_STEP = 2;
/** 字号下限，避免连点"太大"把字调到不可用。 */
const MIN_FONT = 8;

/** 反馈是否指向候选栏（否则默认作用于键盘主输入区）。 */
function targetsCandidate(text: string): boolean {
  return /候选|选词/.test(text);
}

/** 字号一档调节（带下限）。 */
function bumpFont(size: number, delta: number): number {
  return Math.max(MIN_FONT, size + delta);
}

/**
 * asset_param 类最小改：字号加减一档、按键/候选文字色提亮或压暗一档。
 * 只改命中字段，其余字段与另一元素完全不动。
 *
 * PROVISIONAL（待核实）：纯"换字体"（family 切换）不在此做本地改——family 是字体栈字符串而非
 * 数值档位，且 skin-gen 未导出可选字体栈映射；此类反馈按路由回 A3 重生成处理，不在 applyToSpec 内消化。
 */
export function applyToSpec(spec: VisualSpec, text: string): VisualSpec {
  const next = structuredClone(spec); // 深拷贝，绝不动入参
  const t = text ?? "";

  const wantBigger = /太小|字小|偏小/.test(t); // 字太小 → 放大
  const wantSmaller = /太大|字大|偏大/.test(t); // 字太大 → 缩小
  const tooDark = /太深|偏深|颜色深|深了/.test(t); // 太深 → 提亮
  const tooLight = /太浅|太亮|偏浅|偏亮|浅了|亮了/.test(t); // 太浅/太亮 → 压暗

  const onCandidate = targetsCandidate(t);

  // 字号：重建 font 对象再赋值，避免动到与另一侧共享的同一 font（见文件头注）
  if (wantBigger || wantSmaller) {
    const delta = wantBigger ? FONT_STEP : -FONT_STEP;
    if (onCandidate) {
      next.candidateBar.font = {
        ...next.candidateBar.font,
        size: bumpFont(next.candidateBar.font.size, delta),
      };
    } else {
      next.keyboard.font = {
        ...next.keyboard.font,
        size: bumpFont(next.keyboard.font.size, delta),
      };
    }
  }

  // 颜色深浅：按键 → keyFill（任务书示例"这按键颜色太深"）。
  // PROVISIONAL（待核实）：候选栏的"颜色太深/太浅"落到候选文字色 candidate 属我方推断
  //（任务书只明确了按键 keyFill 一例）；若实际应改候选栏背景 bg，需在此调整目标字段。
  // 二者均为字符串，直接改属性无共享引用问题。
  if (tooDark || tooLight) {
    const shift = (hex: string) => (tooDark ? lighten(hex, COLOR_STEP) : darken(hex, COLOR_STEP));
    if (onCandidate) {
      next.candidateBar.candidate = shift(next.candidateBar.candidate);
    } else {
      next.keyboard.keyFill = shift(next.keyboard.keyFill);
    }
  }

  return next;
}

/** 一条风格调整规则：命中 match 即并入 add、弱化 remove（add/remove 已内建极性）。 */
interface StyleRule {
  match: RegExp;
  add: string[];
  remove?: string[];
}

/**
 * 风格/氛围调整规则（架构 §5.3 整体风格行）。
 * 关键：每条规则的措辞已内建**极性**——"太活泼"归入"想更稳重"（弱化活泼），而非"想要活泼"；
 * 故规则里不匹配裸词"活泼/稳重"，只匹配带诉求/抱怨修饰的措辞，避免"太活泼想稳重"两头对撞。
 */
const STYLE_RULES: StyleRule[] = [
  // 想更稳重（含"太活泼/太花哨"这类抱怨 → 弱化活泼）
  {
    match: /稳重点|稳重一点|稳重些|想稳重|更稳重|要稳重|稳一点|沉稳|成熟|端庄|太活泼|活泼了|太花哨|花哨了|太跳|太闹|太俏皮/,
    add: ["稳重"],
    remove: ["活泼", "俏皮", "可爱", "花哨"],
  },
  // 想更活泼（含"太严肃/太沉闷/太稳重"这类抱怨 → 弱化稳重）
  {
    match: /活泼一点|活泼点|活泼些|想活泼|更活泼|要活泼|生动|有活力|欢快|太严肃|太沉闷|太稳|太稳重|稳重了|太正经|呆板|太死板/,
    add: ["活泼"],
    remove: ["稳重", "严肃", "沉闷"],
  },
  // 中国风 / 国潮
  { match: /中国风|国潮|国风|东方|古典|古风|水墨|书法/, add: ["国潮", "中国风"] },
  // 更简约 / 极简（含"太复杂/太花"）
  { match: /简约|极简|简洁|干净|太复杂|太花|极简一点/, add: ["极简"], remove: ["繁复", "复杂"] },
  // 更温暖（含"太冷/太清冷"）
  { match: /温暖|温馨|暖一点|暖色|太冷|太清冷/, add: ["温暖"], remove: ["冷", "清冷"] },
  // 更有科技感 / 未来
  { match: /科技|未来|赛博|现代感|数码/, add: ["科技感"] },
  // 更清新
  { match: /清新|清爽|小清新|自然/, add: ["清新"] },
  // 更高级 / 质感
  { match: /高级|质感|精致|轻奢/, add: ["高级感"] },
];

const MOOD_SEP = " · ";

/** 把 mood 串拆成词元（兼容空格 / · / 、/ , / ，/ 分隔）。 */
function splitMood(mood: string | undefined): string[] {
  return mood ? mood.split(/[\s·、,，/]+/).filter(Boolean) : [];
}

/**
 * style 类最小改：据关键词调整 mood / styleKeywords（加入目标情绪、弱化相反情绪）。
 * 深拷贝、只动这两处；无风格信号则原样返回深拷贝。
 */
export function applyToBrief(brief: DesignBrief, text: string): DesignBrief {
  const next = structuredClone(brief); // 深拷贝，绝不动入参
  const t = text ?? "";

  const add: string[] = [];
  const remove: string[] = [];
  for (const rule of STYLE_RULES) {
    if (!rule.match.test(t)) continue;
    for (const a of rule.add) if (!add.includes(a)) add.push(a);
    for (const r of rule.remove ?? []) if (!remove.includes(r)) remove.push(r);
  }

  // 无风格信号：不动（仍是深拷贝的新对象）
  if (add.length === 0 && remove.length === 0) return next;

  // styleKeywords：剔除 remove、并入 add（去重、保序）
  const kw = next.styleKeywords.filter((k) => !remove.some((r) => k.includes(r)));
  for (const a of add) if (!kw.some((k) => k.includes(a))) kw.push(a);
  next.styleKeywords = kw;

  // mood：同样弱化 remove、并入 add；原本无 mood 则据 add 生成
  const tokens = splitMood(next.mood).filter((k) => !remove.some((r) => k.includes(r)));
  for (const a of add) if (!tokens.some((k) => k.includes(a))) tokens.push(a);
  if (tokens.length) next.mood = tokens.join(MOOD_SEP);

  return next;
}
