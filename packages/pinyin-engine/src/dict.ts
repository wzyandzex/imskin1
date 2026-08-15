/**
 * 词库层 —— 拼音音节序列 → 汉字候选。
 *
 * 分层说明（对齐架构 §4.3 / §11.3）：
 * - 引擎**算法**（分词、T9、排序、翻页）是真实且完备的；
 * - 这里内置的是一份**种子词库**（常用单字 + 常用词），足以让预览对常见输入"打得出、
 *   像回事"，但覆盖率有限；生产级覆盖是"换一份完整 pinyin→词频 数据"的**数据**工作，
 *   不改动引擎代码。`Dict` 定义了清晰的接口，`SeedDict` 是其一个实现，未来可接
 *   librime/libpinyin 系词典或自建大词库（§11.3 选型 Spike）。
 *
 * 键约定：音节序列以 `'` 连接为 key。单字用单音节键（如 `ni`），词用多音节键（如 `ni'hao`）。
 */

import { encodeToDigits } from "./t9.ts";

export interface DictEntry {
  word: string;
  /** 词频权重，越大越常用（相对量纲即可，用于排序）。 */
  freq: number;
}

/** 九宫格数字检索的命中项：某词条 + 它对应的音节 + 消耗的数字位数。 */
export interface DigitMatch {
  word: string;
  freq: number;
  syllables: string[];
  digitsConsumed: number;
}

export interface Dict {
  /** 精确查某个音节序列键对应的候选（已按 freq 降序）。 */
  lookup(pinyinKey: string): DictEntry[];
  /**
   * 九宫格用：查所有"拼音编码为 `digits` 某个前缀"的词条（真实 T9 靠词库在数字空间检索，
   * 而非枚举所有可能拼音再撞词库）。可选能力；未实现时引擎回退到音节枚举。
   */
  lookupByDigits?(digits: string): DigitMatch[];
  /** 该实现的词条总数（用于诊断/测试）。 */
  size(): number;
}

/**
 * 种子词库数据。格式：`"音节键": "词1 词2 词3 ..."`（按常用度从高到低书写，
 * 频率由书写次序自动赋权，无需手填数字）。
 */
const SEED: Record<string, string> = {
  // —— 常用单字（按音节）——
  ni: "你 呢 泥 拟 逆 腻",
  hao: "好 号 毫 豪 耗 浩",
  wo: "我 握 卧 沃 斡",
  shi: "是 时 十 使 事 市 式 试 师 诗 石 识 实 世 始 士 示 释",
  de: "的 得 德 地",
  le: "了 乐 勒",
  bu: "不 部 步 布 补 捕",
  zhong: "中 种 重 钟 众 终 忠",
  guo: "国 过 果 郭 锅 裹",
  ren: "人 认 任 仁 忍 韧",
  shu: "书 数 术 树 输 属 熟 舒 叔",
  ru: "入 如 儒 乳 辱",
  fa: "法 发 罚 乏 阀",
  pin: "拼 频 品 贫 聘",
  yin: "音 因 银 引 印 阴 隐 饮",
  da: "大 打 达 答 搭 沓",
  zi: "字 子 自 紫 资 姿",
  xie: "谢 写 些 血 鞋 携 泄",
  bei: "北 备 被 杯 背 悲 贝",
  jing: "京 经 精 静 惊 净 竟 境 镜 警",
  wen: "文 问 温 闻 稳 吻 纹",
  hen: "很 恨 狠 痕",
  gao: "高 搞 告 稿 糕",
  xing: "行 星 型 形 醒 姓 幸 兴 性",
  ai: "爱 哀 唉 挨 癌",
  xiang: "想 向 相 象 香 像 项 响 详 乡",
  kan: "看 刊 砍 堪 坎",
  chi: "吃 迟 持 尺 齿 赤 池",
  he: "喝 和 河 合 何 盒 核",
  ma: "吗 妈 马 骂 麻 码",
  ne: "呢",
  a: "啊 阿 呵",
  o: "哦 噢",
  // —— 常用词 ——
  "ni'hao": "你好",
  "zhong'guo": "中国",
  "zhong'wen": "中文",
  "shu'ru": "输入",
  "shu'ru'fa": "输入法",
  "pin'yin": "拼音",
  "da'zi": "打字",
  "xie'xie": "谢谢",
  "bei'jing": "北京",
  "wo'men": "我们",
  "ni'men": "你们",
  "shi'jie": "世界",
  "jie'shi": "解释",
  "gao'xing": "高兴",
  "xiang'fa": "想法",
  "shi'jian": "时间",
  "peng'you": "朋友",
  "lv'you": "旅游",
  "xi'an": "西安",
  "xian": "先 现 线 县 显 险 限 鲜 献",
};

/** 只保留纯汉字词（剔除数据里手滑混入的非法字符），并按书写次序赋权。 */
function buildEntries(raw: string): DictEntry[] {
  const words = raw.split(/\s+/).filter(Boolean);
  const entries: DictEntry[] = [];
  let rank = words.length;
  for (const w of words) {
    if (!/^[一-鿿]+$/.test(w)) continue; // 非纯汉字，跳过
    entries.push({ word: w, freq: rank });
    rank -= 1;
  }
  return entries;
}

export class SeedDict implements Dict {
  private readonly map: Map<string, DictEntry[]>;
  /** 数字编码 → 该编码对应的（音节序列 + 词条）列表，供九宫格 O(前缀长度) 检索。 */
  private readonly digitIndex: Map<string, Array<{ syllables: string[]; entries: DictEntry[] }>>;

  constructor(data: Record<string, string> = SEED) {
    this.map = new Map();
    this.digitIndex = new Map();
    for (const [key, raw] of Object.entries(data)) {
      const entries = buildEntries(raw);
      if (entries.length === 0) continue;
      this.map.set(key, entries);

      const syllables = key.split("'");
      const digits = encodeToDigits(syllables.join(""));
      if (digits === "") continue; // 键含无法编码的字符，跳过数字索引
      const bucket = this.digitIndex.get(digits);
      const item = { syllables, entries };
      if (bucket) bucket.push(item);
      else this.digitIndex.set(digits, [item]);
    }
  }

  lookup(pinyinKey: string): DictEntry[] {
    return this.map.get(pinyinKey) ?? [];
  }

  lookupByDigits(digits: string): DigitMatch[] {
    const d = digits.replace(/[^2-9]/g, "");
    const out: DigitMatch[] = [];
    for (let L = 1; L <= d.length; L++) {
      const bucket = this.digitIndex.get(d.slice(0, L));
      if (!bucket) continue;
      for (const { syllables, entries } of bucket) {
        for (const e of entries) {
          out.push({ word: e.word, freq: e.freq, syllables, digitsConsumed: L });
        }
      }
    }
    return out;
  }

  size(): number {
    let n = 0;
    for (const list of this.map.values()) n += list.length;
    return n;
  }
}

/** 默认种子词库单例。 */
export const seedDict = new SeedDict();
