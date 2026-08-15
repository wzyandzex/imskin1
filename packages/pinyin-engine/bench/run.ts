/**
 * PINYIN-001 词库基准 —— 量化"预览可信度"（docs/05 §7 格式）。
 *
 * 两个语料：
 *   1) seed-dict：种子词库自检（每个键的首个词作为期望首选）——度量引擎在自带数据上的
 *      检索/排序正确性；不代表真实世界覆盖率。
 *   2) common-60：60 个日常高频词（大部分不在种子词库内）——度量真实用户输入的缺口，
 *      是 R-09（词库覆盖不足）的直接证据。
 *
 * 诚实边界：
 *   - 本基准只测"输入拼音 → 期望词进入前 N 候选"，不测整句联想/云候选/用户词频学习；
 *   - common-60 未达门槛是**预期结果**（种子词库本就有限），报告如实记录 gap，
 *     词库替换选型（librime/libpinyin 系词典）另行推进后才可能达标；
 *   - 延迟在 Node 进程内测量（预览为浏览器环境，数量级参考；浏览器侧基线随 ENG-001 E2E 补）。
 *
 * 用法：
 *   node packages/pinyin-engine/bench/run.ts                 # 控制台摘要
 *   node packages/pinyin-engine/bench/run.ts --out <path>    # 另存 JSON 报告（证据归档用）
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { PinyinEngine } from "../src/engine.ts";
import { seedDict, seedData } from "../src/dict.ts";
import { encodeToDigits } from "../src/t9.ts";

interface CorpusItem {
  word: string;
  /** 26 键字母输入串（无分隔符，交给引擎自行切分）。 */
  input: string;
}

/** 60 个日常高频词（人工标注拼音；覆盖时间/交际/饮食/出行/天气/情绪等场景）。 */
const COMMON_60: CorpusItem[] = [
  { word: "今天", input: "jitian" }, { word: "明天", input: "mingtian" }, { word: "昨天", input: "zuotian" },
  { word: "现在", input: "xianzai" }, { word: "时间", input: "shijian" }, { word: "工作", input: "gongzuo" },
  { word: "学习", input: "xuexi" }, { word: "学校", input: "xuexiao" }, { word: "学生", input: "xuesheng" },
  { word: "老师", input: "laoshi" }, { word: "朋友", input: "pengyou" }, { word: "我们", input: "women" },
  { word: "你们", input: "nimen" }, { word: "他们", input: "tamen" }, { word: "什么", input: "shenme" },
  { word: "怎么", input: "zenme" }, { word: "因为", input: "yinwei" }, { word: "但是", input: "danshi" },
  { word: "所以", input: "suoyi" }, { word: "如果", input: "ruguo" }, { word: "可是", input: "keshi" },
  { word: "而且", input: "erqie" }, { word: "喜欢", input: "xihuan" }, { word: "想要", input: "xiangyao" },
  { word: "需要", input: "xuyao" }, { word: "可以", input: "keyi" }, { word: "应该", input: "yinggai" },
  { word: "知道", input: "zhidao" }, { word: "觉得", input: "juede" }, { word: "开始", input: "kaishi" },
  { word: "结束", input: "jieshu" }, { word: "等待", input: "dengdai" }, { word: "希望", input: "xiwang" },
  { word: "梦想", input: "mengxiang" }, { word: "生活", input: "shenghuo" }, { word: "世界", input: "shijie" },
  { word: "手机", input: "shouji" }, { word: "电话", input: "dianhua" }, { word: "电脑", input: "diannao" },
  { word: "键盘", input: "jianpan" }, { word: "鼠标", input: "shubiao" }, { word: "屏幕", input: "pingmu" },
  { word: "音乐", input: "yinyue" }, { word: "电影", input: "dianying" }, { word: "游戏", input: "youxi" },
  { word: "吃饭", input: "chifan" }, { word: "睡觉", input: "shuijiao" }, { word: "走路", input: "zoulu" },
  { word: "跑步", input: "paobu" }, { word: "喝茶", input: "hecha" }, { word: "咖啡", input: "kafei" },
  { word: "地铁", input: "ditie" }, { word: "公交", input: "gongjiao" }, { word: "飞机", input: "feiji" },
  { word: "火车", input: "huoche" }, { word: "早上", input: "zaoshang" }, { word: "晚上", input: "wanshang" },
  { word: "天气", input: "tianqi" }, { word: "下雨", input: "xiayu" }, { word: "太阳", input: "taiyang" },
];

/** 种子词库自检语料：每个键的首个词（键内频次最高）作为期望首选。 */
function seedCorpus(): CorpusItem[] {
  const out: CorpusItem[] = [];
  for (const [key, raw] of Object.entries(seedData)) {
    const first = raw.split(/\s+/).filter(Boolean)[0];
    if (!first) continue;
    out.push({ word: first, input: key.replace(/'/g, "") });
  }
  return out;
}

interface HitStats {
  samples: number;
  top1: number;
  top3: number;
  noCandidate: number;
  missesTop3: { word: string; input: string; got: string }[];
}

function hitStats(engine: PinyinEngine, corpus: CorpusItem[], mode: "qwerty" | "t9"): HitStats {
  let top1 = 0;
  let top3 = 0;
  let noCandidate = 0;
  const missesTop3: HitStats["missesTop3"] = [];
  for (const { word, input } of corpus) {
    const feed = mode === "t9" ? encodeToDigits(input) : input;
    const cands = engine.analyze(feed, mode).candidates;
    if (cands.length === 0) {
      noCandidate += 1;
      missesTop3.push({ word, input, got: "" });
      continue;
    }
    const words = cands.map((c) => c.word);
    if (words[0] === word) top1 += 1;
    if (words.slice(0, 3).includes(word)) top3 += 1;
    else missesTop3.push({ word, input, got: words.slice(0, 3).join("/") });
  }
  return { samples: corpus.length, top1, top3, noCandidate, missesTop3 };
}

/** 延迟：语料输入 + 长串，预热后测 page() 单调耗时（ms），总量 ≈ targetSamples。 */
function latency(engine: PinyinEngine, corpus: CorpusItem[], targetSamples = 1000) {
  const longs = ["shurufapifugengxin", "zhongguorenmin", "wangyiyunyinyue", "taiyangxialaoshan"];
  const inputs = [...corpus.map((c) => c.input), ...longs];
  const reps = Math.max(1, Math.round(targetSamples / inputs.length));
  // 预热（JIT/缓存）
  for (const inp of inputs) engine.page(inp, "qwerty", 0, 9);

  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    for (const inp of inputs) {
      const t0 = performance.now();
      engine.page(inp, "qwerty", 0, 9);
      samples.push(performance.now() - t0);
    }
  }
  samples.sort((a, b) => a - b);
  const q = (p: number) => Number(samples[Math.min(samples.length - 1, Math.floor(p * samples.length))].toFixed(3));
  return {
    samples: samples.length,
    p50ms: q(0.5),
    p95ms: q(0.95),
    p99ms: q(0.99),
    maxMs: Number(samples[samples.length - 1].toFixed(3)),
  };
}

// —— 阈值（初始版本；调整需同步 docs/05 §7 与报告 threshold 说明）——
const THRESHOLDS = {
  seedTop3: 0.95, // 引擎对自带词库的检索/排序正确性
  commonTop1: 0.8, // 真实日常输入目标（种子词库预期不达 → 记录 gap）
  commonNoCandidate: 0.1, // 无候选率上限（日常词）
  latencyP95ms: 50, // NFR-PERF-1
};

function main() {
  const engine = new PinyinEngine(); // 默认 = 当前产物词库（种子）
  const seed = seedCorpus();

  const qwertySeed = hitStats(engine, seed, "qwerty");
  const qwertyCommon = hitStats(engine, COMMON_60, "qwerty");
  const t9Common = hitStats(engine, COMMON_60, "t9");
  const lat = latency(engine, COMMON_60, 1000);

  const rate = (n: number, d: number) => Number((d === 0 ? 0 : n / d).toFixed(4));
  const report = {
    benchmarkVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    dataset: { seedDictKeys: seed.length, commonCorpus: COMMON_60.length },
    engine: { dictImpl: "SeedDict", dictSize: seedDict.size(), mode: "production-default" },
    environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model ?? "unknown" },
    qwerty: {
      seedDict: { ...qwertySeed, top1Rate: rate(qwertySeed.top1, qwertySeed.samples), top3Rate: rate(qwertySeed.top3, qwertySeed.samples) },
      common60: { ...qwertyCommon, top1Rate: rate(qwertyCommon.top1, qwertyCommon.samples), top3Rate: rate(qwertyCommon.top3, qwertyCommon.samples), noCandidateRate: rate(qwertyCommon.noCandidate, qwertyCommon.samples) },
    },
    t9: {
      common60: { ...t9Common, top1Rate: rate(t9Common.top1, t9Common.samples), top3Rate: rate(t9Common.top3, t9Common.samples) },
    },
    latency: lat,
    thresholds: THRESHOLDS,
    verdicts: {
      seedTop3Pass: rate(qwertySeed.top3, qwertySeed.samples) >= THRESHOLDS.seedTop3,
      commonTop1Pass: rate(qwertyCommon.top1, qwertyCommon.samples) >= THRESHOLDS.commonTop1,
      commonNoCandidatePass: rate(qwertyCommon.noCandidate, qwertyCommon.samples) <= THRESHOLDS.commonNoCandidate,
      latencyP95Pass: lat.p95ms <= THRESHOLDS.latencyP95ms,
    },
  };

  const outIdx = process.argv.indexOf("--out");
  const json = JSON.stringify(report, null, 2);
  if (outIdx !== -1 && process.argv[outIdx + 1]) {
    const out = process.argv[outIdx + 1];
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json, "utf8");
    console.error(`report written: ${out}`);
  }

  const line = (name: string, s: HitStats & { top1Rate?: number; top3Rate?: number }) =>
    `  ${name}: top1=${s.top1}/${s.samples}${s.top1Rate !== undefined ? ` (${(s.top1Rate * 100).toFixed(1)}%)` : ""}  top3=${s.top3}/${s.samples}${s.top3Rate !== undefined ? ` (${(s.top3Rate * 100).toFixed(1)}%)` : ""}  noCand=${s.noCandidate}`;
  console.log("PINYIN-001 benchmark (seed dict, production default)");
  console.log(line("qwerty/seed-dict ", report.qwerty.seedDict));
  console.log(line("qwerty/common-60", report.qwerty.common60));
  console.log(line("t9/common-60    ", report.t9.common60));
  console.log(`  latency: p50=${lat.p50ms}ms p95=${lat.p95ms}ms p99=${lat.p99ms}ms max=${lat.maxMs}ms (n=${lat.samples})`);
  console.log(`  verdicts: seedTop3=${report.verdicts.seedTop3Pass} commonTop1=${report.verdicts.commonTop1Pass} commonNoCand=${report.verdicts.commonNoCandidatePass} latencyP95=${report.verdicts.latencyP95Pass}`);
  if (!report.verdicts.commonTop1Pass) {
    console.log("  [gap] common-60 未达门槛（种子词库预期）→ R-09 维持 open，词库选型替换后复测。");
  }
}

main();
