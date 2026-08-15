/**
 * 拼音引擎公开 API —— 预览运行时（虚拟键盘）直接消费的门面。
 *
 * 输入：用户敲入的原始缓冲（26 键为 a-z 字母；九宫格为 2-9 数字）+ 输入模式。
 * 输出：当前音节切分 + 尾部残余 + 已排序的候选词（支持翻页，数字键 1-9 选词）。
 *
 * 候选排序（贴近真实输入法直觉）：
 *   主键 覆盖拼音字母数（打得越完整越靠前）→ 次键 词频 → 末键 来源桶（整串词略优于单字）。
 * 两条输入路径共用同一套「排序 + 去重」逻辑：
 *   - 26 键：先分词，再用音节序列键查词库；
 *   - 九宫格：直接用词库的数字索引检索（真实 T9 的做法，避免枚举爆炸）。
 */

import { parse, allSegmentations, normalize } from "./segmenter.ts";
import { t9Segmentations } from "./t9.ts";
import { type Dict, seedDict } from "./dict.ts";

export type InputMode = "qwerty" | "t9";

export interface Candidate {
  word: string;
  /** 该候选消耗的音节序列（选词后据此推进输入缓冲）。 */
  syllables: string[];
  /** 该候选覆盖的拼音字母数（= 各音节长度之和），排序主键。 */
  letters: number;
  /** 该候选来源桶：整串成词 / 前缀成词 / 单字（次要排序与展示信息）。 */
  source: "phrase" | "prefix" | "char";
  freq: number;
}

export interface AnalyzeResult {
  /** 最优切分的音节序列（用于拼音串区展示，如 ni'hao）。 */
  segmentation: string[];
  /** 尾部未成音节的残余（增量输入时展示）。 */
  remainder: string;
  /** 是否被完整切分。 */
  complete: boolean;
  /** 全部候选（已排序、已去重）。 */
  candidates: Candidate[];
}

export interface PageResult extends Omit<AnalyzeResult, "candidates"> {
  candidates: Candidate[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalCandidates: number;
}

export interface EngineOptions {
  dict?: Dict;
  /** 参与整串/前缀成词枚举的最大切分数，防组合爆炸。 */
  maxSegmentations?: number;
}

/** 排序前的原始候选（未去重）。 */
interface RawCandidate {
  word: string;
  syllables: string[];
  source: Candidate["source"];
  freq: number;
}

const BUCKET_RANK: Record<Candidate["source"], number> = {
  phrase: 0,
  prefix: 1,
  char: 2,
};

export class PinyinEngine {
  private readonly dict: Dict;
  private readonly maxSegmentations: number;

  constructor(opts: EngineOptions = {}) {
    this.dict = opts.dict ?? seedDict;
    this.maxSegmentations = opts.maxSegmentations ?? 8;
  }

  /** 得到某个输入缓冲的切分与全部候选。 */
  analyze(input: string, mode: InputMode = "qwerty"): AnalyzeResult {
    return mode === "t9" ? this.analyzeT9(input) : this.analyzeQwerty(input);
  }

  /** 分页版本，供 UI 直接用（默认每页 9，对应数字键 1-9）。 */
  page(input: string, mode: InputMode = "qwerty", page = 0, pageSize = 9): PageResult {
    const r = this.analyze(input, mode);
    const start = page * pageSize;
    const slice = r.candidates.slice(start, start + pageSize);
    return {
      segmentation: r.segmentation,
      remainder: r.remainder,
      complete: r.complete,
      candidates: slice,
      page,
      pageSize,
      hasMore: start + pageSize < r.candidates.length,
      totalCandidates: r.candidates.length,
    };
  }

  // —— 26 键 ——
  private analyzeQwerty(input: string): AnalyzeResult {
    const p = parse(input);
    const raw: RawCandidate[] = [];

    if (p.syllables.length > 0) {
      // 候选切分集合：完整覆盖时枚举多切分，否则用已覆盖前缀。
      // 但**显式分隔符（' 或空格）是用户强制的音节边界**：此时不得在抹掉分隔符的整串上
      // 重新枚举（那会跨越边界，如 xi'an 冒出 xian 读法），只采用 parse 尊重边界的切分。
      let segSeqs: string[][] = [p.syllables];
      const hasSeparator = /['\s]/.test(normalize(input));
      if (p.complete && !hasSeparator) {
        const lettersOnly = normalize(input).replace(/['\s]+/g, "");
        const alts = allSegmentations(lettersOnly, this.maxSegmentations);
        segSeqs = alts.some((s) => s.join("'") === p.syllables.join("'"))
          ? alts
          : [p.syllables, ...alts];
      }

      // 1) 整串成词（各切分的完整 key）
      for (const seq of segSeqs) {
        if (seq.length === 0) continue;
        for (const e of this.dict.lookup(seq.join("'"))) {
          raw.push({ word: e.word, syllables: seq, source: seq.length === 1 ? "char" : "phrase", freq: e.freq });
        }
      }
      // 2) 前缀成词（最优切分的前 L 个音节）
      for (let L = p.syllables.length - 1; L >= 2; L--) {
        const prefix = p.syllables.slice(0, L);
        for (const e of this.dict.lookup(prefix.join("'"))) {
          raw.push({ word: e.word, syllables: prefix, source: "prefix", freq: e.freq });
        }
      }
      // 3) 首音节单字
      for (const e of this.dict.lookup(p.syllables[0])) {
        raw.push({ word: e.word, syllables: [p.syllables[0]], source: "char", freq: e.freq });
      }
    }

    return {
      segmentation: p.syllables,
      remainder: p.remainder,
      complete: p.complete,
      candidates: finalize(raw),
    };
  }

  // —— 九宫格 T9 ——
  private analyzeT9(input: string): AnalyzeResult {
    const digits = input.replace(/[^2-9]/g, "");

    let raw: RawCandidate[];
    if (this.dict.lookupByDigits) {
      // 词库数字索引直查（真实 T9）
      raw = this.dict.lookupByDigits(digits).map((m) => ({
        word: m.word,
        syllables: m.syllables,
        source: m.syllables.length === 1 ? ("char" as const) : ("phrase" as const),
        freq: m.freq,
      }));
    } else {
      // 回退：枚举音节序列再用 lookup（限一定数量）
      const seqs = t9Segmentations(digits, Math.max(this.maxSegmentations, 200));
      raw = [];
      for (const seq of seqs) {
        for (const e of this.dict.lookup(seq.join("'"))) {
          raw.push({ word: e.word, syllables: seq, source: seq.length === 1 ? "char" : "phrase", freq: e.freq });
        }
      }
    }

    const candidates = finalize(raw);

    // 拼音串展示：若首选候选覆盖了全部数字，用它的音节（更贴合用户所见）；
    // 否则退回数字串的最长匹配切分。
    let display = t9Segmentations(digits, 1)[0] ?? [];
    const top = candidates[0];
    if (top && top.letters === digits.length) {
      display = top.syllables;
    }

    return {
      segmentation: display,
      remainder: "",
      complete: digits.length > 0 && display.length > 0,
      candidates,
    };
  }
}

/** 去重（同词保留覆盖更多者 / 同覆盖保留更高来源）+ 排序。 */
function finalize(raw: RawCandidate[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Map<string, number>();

  for (const r of raw) {
    const letters = r.syllables.reduce((n, s) => n + s.length, 0);
    const cand: Candidate = { word: r.word, syllables: r.syllables, letters, source: r.source, freq: r.freq };
    const idx = seen.get(r.word);
    if (idx === undefined) {
      seen.set(r.word, out.length);
      out.push(cand);
      continue;
    }
    const prev = out[idx];
    if (
      cand.letters > prev.letters ||
      (cand.letters === prev.letters && BUCKET_RANK[cand.source] < BUCKET_RANK[prev.source])
    ) {
      out[idx] = cand;
    }
  }

  out.sort((a, b) => {
    if (a.letters !== b.letters) return b.letters - a.letters;
    if (a.freq !== b.freq) return b.freq - a.freq;
    return BUCKET_RANK[a.source] - BUCKET_RANK[b.source];
  });
  return out;
}

/** 默认引擎单例（种子词库）。 */
export const pinyinEngine = new PinyinEngine();
