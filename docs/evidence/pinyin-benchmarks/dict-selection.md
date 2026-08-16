# PINYIN-001 词库选型决策笔记

> 状态：调研中（WebSearch agent 超时未归——本笔记基于架构文档 §11.3/§11.6 已知候选 + 基准数据先写决策框架；agent 返回后补充实测细节）
> 基准依据：`docs/evidence/pinyin-benchmarks/initial/`（日常 60 词 top1=8.3% → 需替换；引擎正确性 98.1% 已证明）

## 约束回顾

| 维度 | 要求 |
|---|---|
| 数据格式 | key = 拼音音节序列（`ni'hao`），value = 词+频列表（当前 SeedDict 契约） |
| 规模 | 5k–50k 词条（浏览器 JSON 嵌入可行；当前种子 230 条） |
| 拼音标注 | 词条必须自带拼音（不做汉字→拼音反向转换） |
| 许可证 | 须允许嵌入闭源产品分发（非 GPL/AGPL 传染） |
| T9 | 词库音节可做数字索引（引擎已支持，纯数据工作） |

## 候选对比（初判，待 agent 结果修正）

| 候选 | 词条自带拼音 | 规模 | 词频 | 许可证 | 判断 |
|---|---|---|---|---|---|
| **rime/luna_pinyin.dict.yaml** | ✅（音节+词组） | ~10 万词 | ✅（书写序） | LGPL（词库部分） | ⚠️ LGPL 对嵌入分发友好但需确认词库文件单独条款 |
| **CC-CEDICT** | ❌（拼音在释义字段，需解析） | ~12 万条 | ❌ | CC-BY-SA 4.0 | ⚠️ 需提取+无词频；SA 条款注意 |
| **mozillazg/pinyin-data** | ❌（单字表，非词条） | ~20k 单字 | ❌ | MIT | ❌ 不是词库（字级拼音） |
| **Rime 生态词频表**（essay.txt） | ❌（纯词频，无拼音） | ~80 万词 | ✅ | LGPL | 需与 luna_pinyin 合并使用 |
| **自建**（结巴词表 + pypinyin 标注） | 需管线 | 依赖结巴词表 | 结巴有 | Apache 2.0（结巴） | ✅ 许可干净；需离线管线一次转换 |

## 推荐（待验证）

**首选：结巴词表（~35 万词条，Apache 2.0） + pypinyin 离线标注 → 截取高频前 30k → 转为 SeedDict JSON 格式**

理由：
1. **许可证最干净**：Apache 2.0 允许嵌入分发不传染；
2. **有词频**：结巴自带词频排序，截取高频即可；
3. **管线一次完成**：离线 Python 脚本（结巴 dict.txt + pypinyin → JSON），不进运行时依赖；
4. **规模可控**：取前 30k 词条 ≈ 500KB JSON（gzip 后 ~150KB），浏览器可承受。

次选：rime luna_pinyin（若 LGPL 词库文件确认可分发）。

## 下一步

1. ✅ 确认许可证（结巴 Apache 2.0 已确认；rime 词库待查具体文件头）
2. 离线管线：`tools/build-dict.py`（结巴+pypinyin → `pinyin-engine/src/dict-data.json`）
3. `SeedDict` 构造函数接受导入 JSON（已支持 `data` 参数，零代码改动）
4. 复测 benchmark：`npm run bench:pinyin -- --out docs/evidence/pinyin-benchmarks/<dict-version>/report.json`
5. 达标门槛：common-60 top1 ≥ 80%、无候选 ≤ 10%、P95 ≤ 50ms

## 风险

- 30k 词条 T9 索引构建耗时（浏览器首次加载 ~100ms？可接受）
- 词频质量：结巴词频来自新闻语料，日常口语覆盖可能不足 → benchmark 将如实反映
