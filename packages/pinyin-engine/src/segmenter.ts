/**
 * 拼音串分词器 —— 把用户敲入的拼音字母流切成音节序列。
 *
 * 为什么不能用"贪心最长匹配"糊弄：像 `xian` 既可能是「西安 xi'an」也可能是「先 xian」，
 * `fangan` 既是「反感 fan'gan」也是「方案 fang'an」。真实输入法要在多种切分里择优（最终由
 * 词频在候选层排序），因此这里提供：
 *   - parse()            返回"最优单一切分"（音节数最少，同分时最长音节优先），并处理用户
 *                        仍在敲入的**未完成尾巴**（增量输入必需）。
 *   - allSegmentations() 返回全部合法完整切分，供候选生成跨切分取词。
 *
 * 全部在 a-z 空间上工作（ü 已在音节表里记作 v）。显式分隔符 `'` 或空格强制音节边界。
 */

import {
  SYLLABLES,
  MAX_SYLLABLE_LEN,
  isSyllablePrefix,
} from "./syllables.ts";

export interface ParseResult {
  /** 已确定的完整音节序列。 */
  syllables: string[];
  /** 尾部尚未构成完整音节的残余（可能是合法前缀，用户还在敲；也可能是非法残串）。 */
  remainder: string;
  /** 整串是否被完整切分（remainder 为空）。 */
  complete: boolean;
  /** 输入是否至少可被解释（有音节，或残余是合法音节前缀）。 */
  valid: boolean;
}

const SEPARATOR = /['\s]+/;

/** 规范化：转小写，仅保留 a-z 与分隔符；ü/ｖ 归一为 v。 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/ü/g, "v")
    .replace(/[^a-z'\s]/g, "");
}

/**
 * 对一个不含分隔符的纯字母块做 DP 分词。
 * dp[i]：覆盖 [0,i) 的最优状态（音节数最少；同分时最后一个音节更长者优先）。
 */
function segmentChunk(chunk: string): { syllables: string[]; remainder: string } {
  const n = chunk.length;
  if (n === 0) return { syllables: [], remainder: "" };

  // dp[i] = { count, lastLen, from } 或 null（不可达）
  type Cell = { count: number; lastLen: number; from: number } | null;
  const dp: Cell[] = new Array(n + 1).fill(null);
  dp[0] = { count: 0, lastLen: 0, from: -1 };

  for (let i = 1; i <= n; i++) {
    const lo = Math.max(0, i - MAX_SYLLABLE_LEN);
    for (let j = i - 1; j >= lo; j--) {
      if (dp[j] === null) continue;
      const piece = chunk.slice(j, i);
      if (!SYLLABLES.has(piece)) continue;
      const cand = { count: dp[j]!.count + 1, lastLen: i - j, from: j };
      const cur = dp[i];
      if (
        cur === null ||
        cand.count < cur.count ||
        (cand.count === cur.count && cand.lastLen > cur.lastLen)
      ) {
        dp[i] = cand;
      }
    }
  }

  // 找到最靠右的可完整覆盖位置
  let end = n;
  while (end > 0 && dp[end] === null) end--;

  const syllables: string[] = [];
  let cur = end;
  while (cur > 0) {
    const cell = dp[cur]!;
    syllables.unshift(chunk.slice(cell.from, cur));
    cur = cell.from;
  }
  return { syllables, remainder: chunk.slice(end) };
}

/** 解析整串（含分隔符处理）。 */
export function parse(input: string): ParseResult {
  const norm = normalize(input);
  if (norm === "") {
    return { syllables: [], remainder: "", complete: true, valid: true };
  }

  const chunks = norm.split(SEPARATOR).filter((c) => c.length > 0);
  const syllables: string[] = [];
  let remainder = "";

  for (let k = 0; k < chunks.length; k++) {
    const isLast = k === chunks.length - 1;
    const seg = segmentChunk(chunks[k]);
    syllables.push(...seg.syllables);
    if (seg.remainder !== "") {
      // 非末块却有残余 = 该块无法整切（分隔符内部有非法串），保留残余并停止（其后不再可靠）
      remainder = seg.remainder;
      if (!isLast) {
        // 把后续块也并入残余，避免给出误导性的"部分成功"
        remainder += chunks.slice(k + 1).join("'");
      }
      break;
    }
  }

  const complete = remainder === "";
  const valid = syllables.length > 0 || (remainder !== "" && isSyllablePrefix(remainder));
  return { syllables, remainder, complete, valid };
}

/**
 * 枚举一个纯字母块的全部合法完整切分（供候选生成跨切分取词）。
 * 为防指数爆炸，限制返回数量 `limit`，按"音节数少、整体更符合最长匹配"的顺序优先返回。
 */
export function allSegmentations(input: string, limit = 8): string[][] {
  const norm = normalize(input).replace(SEPARATOR, "");
  const n = norm.length;
  if (n === 0) return [];

  const results: string[][] = [];
  const memoFail = new Set<number>(); // 从该位置出发无法整切

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
    // 长音节优先，倾向最长匹配的切分先出
    for (let end = hi; end > pos; end--) {
      const piece = norm.slice(pos, end);
      if (!SYLLABLES.has(piece)) continue;
      stack.push(piece);
      dfs(end);
      stack.pop();
      if (results.length >= limit) return;
    }
    if (results.length === before) memoFail.add(pos);
  };

  dfs(0);
  return results;
}
