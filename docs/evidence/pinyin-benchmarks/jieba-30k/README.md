# 词库基准 jieba-30k（PINYIN-001 完成版）

> 运行：`npm run bench:pinyin -- --out docs/evidence/pinyin-benchmarks/jieba-30k/report.json`
> 数据：`report.json`（同目录）｜ 采集日：2026-08-18 ｜ 任务：PINYIN-001 ✅
> 词库：结巴词表 top 30k（Apache 2.0）+ pypinyin（MIT）离线管线 → 21638 拼音键 / 503KB JSON

## 结果（对比种子库基线 initial/）

| 指标 | 种子库（initial） | 结巴 30k | 门槛 | 判定 |
|---|---:|---:|---:|---|
| qwerty 自检 top3 | 52/53（98.1%） | **21622/21638（99.9%）** | ≥95% | ✅ |
| qwerty 日常 60 词 top1 | 5/60（8.3%） | **59/60（98.3%）** | ≥80% | ✅ **从 8.3%→98.3%** |
| qwerty 日常 60 词无候选 | 47/60（78.3%） | **0/60（0%）** | ≤10% | ✅ **从 78.3%→0%** |
| t9 日常 60 词 top1 | 5/60（8.3%） | **48/60（80.0%）** | —（参考） | 大幅提升 |
| t9 无候选 | 26/60（43.3%） | **0/60（0%）** | — | ✅ |
| 延迟 p95（qwerty page） | 0.028ms | **0.01ms** | ≤50ms | ✅ |

## 结论

**R-09 词库覆盖已关闭**：结巴 30k 管线将日常输入从"基本不可用"提升到"日常基本顺畅"（SRS FR-PREVIEW-2 AC2）。

- **引擎算法稳定**：自检 99.9%（21612 词首选命中），延迟 P95=0.01ms 在 21638 键量级下依然远低于 50ms 预算。
- **T9 提升**：top1 80%（48/60），top3 91.7%（55/60），无候选清零——T9 歧义天然更难（数字前缀匹配多词），80% 已可用，后续可引入词频 T9 专项排序继续优化。
- **唯一 top3 miss**（16/21638）来自多音字/罕见切分，不构成产品阻塞。
- **词频质量**：结巴词频来自新闻语料，日常口语 60 词覆盖 98.3% 证明基本充分；长尾口语词可后续扩充语料。

## 许可证合规

- 结巴 `dict.txt`：Apache License 2.0（允许嵌入分发，不传染）
- pypinyin：MIT License
- 管线脚本：`tools/build-dict.py`（本仓库，一次性离线运行，不进运行时依赖）

## 复现

```bash
# 1. 重建词库数据（可选，已有 dict-data.json 则跳过）
python tools/build-dict.py --top 30000

# 2. 复测基准
npm run bench:pinyin -- --out docs/evidence/pinyin-benchmarks/jieba-30k/report.json
```
