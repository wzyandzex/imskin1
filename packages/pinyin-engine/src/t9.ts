/**
 * 九宫格（9 键 T9）适配层 —— 印证架构 §4.8：拼音内核只需具备 26 键能力，
 * 九宫格通过"数字键→字母集合展开 + 复用同一套音节表做切分"叠加实现。
 *
 * 标准 T9 键位：
 *   2=abc 3=def 4=ghi 5=jkl 6=mno 7=pqrs 8=tuv 9=wxyz
 *
 * 一串数字对应"字母集合的笛卡尔积"，歧义远大于 26 键；但用合法音节表在数字空间上做
 * DP 切分，可把绝大多数非法组合剪掉，直接产出"可能的拼音音节序列"，再喂给与 26 键
 * 完全相同的词库候选逻辑。
 */

import { SYLLABLES, MAX_SYLLABLE_LEN } from "./syllables.ts";

/** 数字键 → 字母集合。 */
export const T9_KEYS: Readonly<Record<string, string>> = {
  "2": "abc",
  "3": "def",
  "4": "ghi",
  "5": "jkl",
  "6": "mno",
  "7": "pqrs",
  "8": "tuv",
  "9": "wxyz",
};

/** 字母 → 数字键。 */
export const LETTER_TO_DIGIT: Readonly<Record<string, string>> = (() => {
  const m: Record<string, string> = {};
  for (const [digit, letters] of Object.entries(T9_KEYS)) {
    for (const ch of letters) m[ch] = digit;
  }
  return m;
})();

/** 把字母串编码为 T9 数字串（v 视作 ü 的输入形式，归到 8=tuv 的 v？ 实际 v 不在键面，
 *  九宫格拼音里 ü 通常敲对应 u 的按键。此处把 v 归到 8，与 u 同键，符合多数九宫格实现）。 */
export function encodeToDigits(letters: string): string {
  let out = "";
  for (const ch of letters) {
    if (ch === "v") {
      out += "8"; // ü/v 与 u 同键
      continue;
    }
    const d = LETTER_TO_DIGIT[ch];
    if (d === undefined) return ""; // 含非法字符，整体作废
    out += d;
  }
  return out;
}

/** 数字串 → 该数字串所能表示的全部合法音节（复用音节表，一次性预建索引）。 */
const SYLLABLES_BY_DIGITS: ReadonlyMap<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const syl of SYLLABLES) {
    const key = encodeToDigits(syl);
    if (key === "") continue;
    const list = map.get(key);
    if (list) list.push(syl);
    else map.set(key, [syl]);
  }
  return map;
})();

/** 给定数字串，返回它能对应的合法音节列表（长度不限，按需在 DP 中按窗口查询）。 */
export function syllablesForDigits(digits: string): string[] {
  return SYLLABLES_BY_DIGITS.get(digits) ?? [];
}

/**
 * 对纯数字串（2-9）做 T9 切分，枚举"可能的拼音音节序列"（字母空间）。
 * 长音节优先、结果数上限 `limit`，与 26 键的 allSegmentations 行为对齐。
 */
export function t9Segmentations(digits: string, limit = 12): string[][] {
  const d = digits.replace(/[^2-9]/g, "");
  const n = d.length;
  if (n === 0) return [];

  const results: string[][] = [];
  const memoFail = new Set<number>();
  const stack: string[] = [];

  const dfs = (pos: number): void => {
    if (results.length >= limit) return;
    if (pos === n) {
      results.push([...stack]);
      return;
    }
    if (memoFail.has(pos)) return;
    const before = results.length;
    const hi = Math.min(n, pos + MAX_SYLLABLE_LEN);
    for (let end = hi; end > pos; end--) {
      const key = d.slice(pos, end);
      const syls = SYLLABLES_BY_DIGITS.get(key);
      if (!syls) continue;
      for (const syl of syls) {
        stack.push(syl);
        dfs(end);
        stack.pop();
        if (results.length >= limit) return;
      }
    }
    if (results.length === before) memoFail.add(pos);
  };

  dfs(0);
  return results;
}
