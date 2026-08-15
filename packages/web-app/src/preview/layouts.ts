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

/** 符号面板：常用中文标点/符号，字面插入；底行返回拼音。 */
export const SYMBOL_LAYOUT: KeyCap[][] = [
  "，。？！、；：".split("").map((c) => lit(c)),
  "“”‘’（）【】".split("").map((c) => lit(c)),
  "…—～·《》「」".split("").map((c) => lit(c)),
  "@#￥%&*+-=".split("").map((c) => lit(c)),
  [TO_PINYIN, TO_NUMBER, SPACE, BACKSPACE, ENTER],
];

/** 数字面板：计算器式数字 + 常用符号，字面插入；底行返回拼音。 */
export const NUMBER_LAYOUT: KeyCap[][] = [
  "123".split("").map((c) => lit(c)),
  "456".split("").map((c) => lit(c)),
  "789".split("").map((c) => lit(c)),
  [lit("."), lit("0"), BACKSPACE],
  [TO_PINYIN, TO_SYMBOL, SPACE, ENTER],
];

/** 按拼音模式 + 当前面板选布局。面板优先（符号/数字面板与拼音模式正交）。 */
export function layoutFor(mode: "qwerty" | "t9", panel: PanelKind = "pinyin"): KeyCap[][] {
  if (panel === "symbol") return SYMBOL_LAYOUT;
  if (panel === "number") return NUMBER_LAYOUT;
  return mode === "t9" ? T9_LAYOUT : QWERTY_LAYOUT;
}
