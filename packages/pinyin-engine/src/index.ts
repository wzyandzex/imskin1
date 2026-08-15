/**
 * @imskin/pinyin-engine —— 预览引擎的真实拼音输入内核。
 *
 * 公开面：
 * - 音节层：SYLLABLES / isSyllable / isSyllablePrefix
 * - 分词层：parse / allSegmentations / normalize
 * - 九宫格：T9_KEYS / t9Segmentations / encodeToDigits
 * - 词库层：Dict / SeedDict / seedDict
 * - 引擎：  PinyinEngine / pinyinEngine（含 analyze / page）
 */

export {
  SYLLABLES,
  MAX_SYLLABLE_LEN,
  isSyllable,
  isSyllablePrefix,
} from "./syllables.ts";

export {
  parse,
  allSegmentations,
  normalize,
  type ParseResult,
} from "./segmenter.ts";

export {
  T9_KEYS,
  LETTER_TO_DIGIT,
  encodeToDigits,
  syllablesForDigits,
  t9Segmentations,
} from "./t9.ts";

export {
  type Dict,
  type DictEntry,
  SeedDict,
  seedDict,
} from "./dict.ts";

export {
  PinyinEngine,
  pinyinEngine,
  type InputMode,
  type Candidate,
  type AnalyzeResult,
  type PageResult,
  type EngineOptions,
} from "./engine.ts";

export {
  InputSession,
  type SessionView,
  type SessionOptions,
} from "./session.ts";
