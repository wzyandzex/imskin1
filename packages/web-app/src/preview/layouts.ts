/**
 * 键盘布局 —— 26 键全键盘 与 九宫格 T9 两套。每个键携带展示信息 + 触发的 KeyAction。
 * 布局与皮肤解耦：布局定"有哪些键、按下做什么"，皮肤定"长什么样"。
 */

import type { KeyAction, PanelKind } from "./actions.ts";

export interface KeyCap {
  /** 主标签。 */
  label: string;
  /** 副标签（九宫格上的字母组等）。 */
  sub?: string;
  /** 次字符：上滑/长按输入（如 26 键顶行的数字）。以字面文本插入。 */
  secondary?: string;
  action: KeyAction;
  /** 相对宽度（1 = 普通键；空格等更宽）。 */
  flex?: number;
  /** 是否为功能键（套用皮肤 specialKey 样式）。 */
  special?: boolean;
}

const letter = (ch: string): KeyCap => ({ label: ch, action: { type: "input", value: ch } });

/** 顶行字母 + 次字符数字（q→1 … p→0），上滑或长按输入数字。 */
const topLetter = (ch: string, digit: string): KeyCap => ({
  label: ch,
  secondary: digit,
  action: { type: "input", value: ch },
});

const BACKSPACE: KeyCap = { label: "⌫", action: { type: "backspace" }, special: true, flex: 1.5 };
const ENTER: KeyCap = { label: "⏎", action: { type: "enter" }, special: true, flex: 1.6 };
const SPACE: KeyCap = { label: "空格", action: { type: "space" }, flex: 4 };
const COMMA: KeyCap = { label: "，", action: { type: "literal", value: "，" }, special: true };
const PERIOD: KeyCap = { label: "。", action: { type: "literal", value: "。" }, special: true };
const TO_T9: KeyCap = { label: "九", action: { type: "mode", value: "t9" }, special: true, flex: 1.3 };
const TO_QWERTY: KeyCap = { label: "拼", action: { type: "mode", value: "qwerty" }, special: true, flex: 1.3 };
const TO_SYMBOL: KeyCap = { label: "符", action: { type: "panel", value: "symbol" }, special: true, flex: 1.3 };
const TO_NUMBER: KeyCap = { label: "123", action: { type: "panel", value: "number" }, special: true, flex: 1.3 };
const TO_EMOJI: KeyCap = { label: "☺", action: { type: "panel", value: "emoji" }, special: true, flex: 1.2 };
const TO_PINYIN: KeyCap = { label: "返回", action: { type: "panel", value: "pinyin" }, special: true, flex: 1.5 };

/** 字面插入键（符号/数字面板用）。 */
const lit = (ch: string, flex?: number): KeyCap => ({ label: ch, action: { type: "literal", value: ch }, flex });

/** 26 键全键盘。顶行带数字次字符（上滑/长按输入）；底行含 符/123 切面板。 */
export const QWERTY_LAYOUT: KeyCap[][] = [
  "qwertyuiop".split("").map((ch, i) => topLetter(ch, "1234567890"[i])),
  "asdfghjkl".split("").map(letter),
  [TO_T9, ..."zxcvbnm".split("").map(letter), BACKSPACE],
  [TO_NUMBER, TO_SYMBOL, COMMA, SPACE, PERIOD, ENTER],
];

const t9Key = (digit: string, letters: string): KeyCap => ({
  label: digit,
  sub: letters,
  action: { type: "input", value: digit },
});

/** 九宫格 T9。数字键携带字母组；底行为切换/空格/退格 + 符/123。 */
export const T9_LAYOUT: KeyCap[][] = [
  [t9Key("2", "abc"), t9Key("3", "def"), t9Key("4", "ghi")],
  [t9Key("5", "jkl"), t9Key("6", "mno"), t9Key("7", "pqrs")],
  [t9Key("8", "tuv"), t9Key("9", "wxyz"), BACKSPACE],
  [TO_QWERTY, TO_SYMBOL, SPACE, TO_NUMBER, ENTER],
];

/** 符号面板：常用中文标点/符号，字面插入；底行返回拼音 + 数字/表情入口。 */
export const SYMBOL_LAYOUT: KeyCap[][] = [
  "，。？！、；：".split("").map((c) => lit(c)),
  "“”‘’（）【】".split("").map((c) => lit(c)),
  "…—～·《》「」".split("").map((c) => lit(c)),
  "@#￥%&*+-=".split("").map((c) => lit(c)),
  [TO_PINYIN, TO_NUMBER, TO_EMOJI, SPACE, BACKSPACE, ENTER],
];

/** 数字面板：计算器式数字 + 常用符号，字面插入；底行返回拼音 + 符号/表情入口。 */
export const NUMBER_LAYOUT: KeyCap[][] = [
  "123".split("").map((c) => lit(c)),
  "456".split("").map((c) => lit(c)),
  "789".split("").map((c) => lit(c)),
  [lit("."), lit("0"), BACKSPACE],
  [TO_PINYIN, TO_SYMBOL, TO_EMOJI, SPACE, ENTER],
];

/** 表情面板（MOB-001）：常用 emoji 字面插入；底行返回拼音 + 符号/数字入口。
 *  显式数组（不用 split）：emoji 常带变体选择符（如 ❤️ = U+2764+FE0F），任何切割都易拆坏。 */
export const EMOJI_LAYOUT: KeyCap[][] = [
  ["😀", "😁", "😂", "🤣", "😊", "😍", "😎", "🤔", "😐", "😴", "😭", "😡"].map((c) => lit(c)),
  ["👍", "👏", "🙏", "💪", "🎉", "❤️", "💔", "✨", "🌟", "🍀", "🌸", "🍎"].map((c) => lit(c)),
  ["☕", "🎮", "📚", "🚀", "🏠", "✉️", "🌙", "☀️", "🌈", "🎵", "🍕", "🐱"].map((c) => lit(c)),
  [TO_PINYIN, TO_SYMBOL, TO_NUMBER, SPACE, BACKSPACE, ENTER],
];

/** 按拼音模式 + 当前面板选布局。面板优先（符号/数字/表情面板与拼音模式正交）。
 *  MOB-004：移动端传入 outlet 时按平台选择专属底行布局（搜狗/百度功能行不同）。 */
export function layoutFor(mode: "qwerty" | "t9", panel: PanelKind = "pinyin", outlet?: string): KeyCap[][] {
  if (panel === "symbol") return SYMBOL_LAYOUT;
  if (panel === "number") return NUMBER_LAYOUT;
  if (panel === "emoji") return EMOJI_LAYOUT;
  if (mode === "t9") {
    if (outlet === "baidu_android") return BAIDU_ANDROID_T9_LAYOUT;
    if (outlet === "sogou_android") return SOGOU_ANDROID_T9_LAYOUT;
    return T9_LAYOUT;
  }
  // qwerty mode
  if (outlet === "baidu_android") return BAIDU_ANDROID_QWERTY_LAYOUT;
  if (outlet === "sogou_android") return SOGOU_ANDROID_QWERTY_LAYOUT;
  return QWERTY_LAYOUT;
}

// —— MOB-004：Android 平台专属布局（搜狗/百度底行功能键不同，docs/02 §6.3/§8.3） ——

/** 搜狗 Android 26 键：底行 = 拼/符/空格/退格/回车（搜狗风格：九/26 切换突出）。 */
export const SOGOU_ANDROID_QWERTY_LAYOUT: KeyCap[][] = [
  "qwertyuiop".split("").map((ch, i) => topLetter(ch, "1234567890"[i])),
  "asdfghjkl".split("").map(letter),
  [TO_T9, ..."zxcvbnm".split("").map(letter), BACKSPACE],
  [TO_SYMBOL, TO_NUMBER, COMMA, SPACE, PERIOD, ENTER],
];

/** 百度 Android 26 键：底行 = 中英/符/语音/空格/回车（百度风格：中英+语音入口突出）。 */
const TO_EN: KeyCap = { label: "中/EN", action: { type: "literal", value: "" }, special: true, flex: 1.5 };
const VOICE: KeyCap = { label: "🎤", action: { type: "literal", value: "" }, special: true, flex: 1.2 };
export const BAIDU_ANDROID_QWERTY_LAYOUT: KeyCap[][] = [
  "qwertyuiop".split("").map((ch, i) => topLetter(ch, "1234567890"[i])),
  "asdfghjkl".split("").map(letter),
  [..."zxcvbnm".split("").map(letter), BACKSPACE],
  [TO_EN, TO_SYMBOL, VOICE, SPACE, ENTER],
];

/** 搜狗 Android T9：底行 = 拼/符/空格/123/回车。 */
export const SOGOU_ANDROID_T9_LAYOUT: KeyCap[][] = [
  [t9Key("2", "abc"), t9Key("3", "def"), t9Key("4", "ghi")],
  [t9Key("5", "jkl"), t9Key("6", "mno"), t9Key("7", "pqrs")],
  [t9Key("8", "tuv"), t9Key("9", "wxyz"), BACKSPACE],
  [TO_QWERTY, TO_SYMBOL, SPACE, TO_NUMBER, ENTER],
];

/** 百度 Android T9：底行 = 拼/符/语音/空格/回车（无 123 入口，语音替代）。 */
export const BAIDU_ANDROID_T9_LAYOUT: KeyCap[][] = [
  [t9Key("2", "abc"), t9Key("3", "def"), t9Key("4", "ghi")],
  [t9Key("5", "jkl"), t9Key("6", "mno"), t9Key("7", "pqrs")],
  [t9Key("8", "tuv"), t9Key("9", "wxyz"), BACKSPACE],
  [TO_QWERTY, TO_SYMBOL, VOICE, SPACE, ENTER],
];
