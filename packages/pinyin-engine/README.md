# @imskin/pinyin-engine

预览引擎的**真实拼音输入内核**。对齐架构 §4.3：预览必须用真引擎产出真实候选词，
不能配一组写死的假候选——只有真实候选序列（长度不一、多音字、翻页、生僻字）才能把
皮肤候选栏的排版边界暴露出来。

## 能力

- **合法音节表**（`syllables.ts`）：约 410 个标准无调音节，ASCII 可敲入形式（ü→v）。
- **拼音分词**（`segmenter.ts`）：DP 切分，处理歧义（`xian` vs `xi'an`）、显式分隔符、
  以及边打边看的**未完成尾巴**（增量输入）。
- **九宫格 T9**（`t9.ts` + 词库数字索引）：印证架构 §4.8——内核只需 26 键能力，九宫格靠
  「数字键→字母集合」叠加；候选由**词库在数字空间检索**驱动（真实 T9 做法，避免枚举爆炸）。
- **词库层**（`dict.ts`）：`Dict` 接口 + `SeedDict` 种子实现。引擎算法完备；覆盖率是
  「换一份完整 pinyin→词频 数据」的数据工作，不改代码（§11.3 选型 Spike）。
- **引擎门面**（`engine.ts`）：`analyze` / `page`，候选按「覆盖字母数→词频→来源」排序，
  支持翻页（数字键 1-9 选词）。26 键与九宫格共用同一套排序去重。

## 用法

```ts
import { pinyinEngine } from "@imskin/pinyin-engine";

pinyinEngine.page("nihao");          // → 你好 你 呢 泥 …
pinyinEngine.page("shurufa");        // → 输入法 输入 书 数 …
pinyinEngine.page("64426", "t9");    // → 你好 你 呢 …（九宫格）
```

注入自定义词库（引擎与数据解耦）：

```ts
import { PinyinEngine } from "@imskin/pinyin-engine";
const engine = new PinyinEngine({ dict: myFullDict });
```

## 测试

零第三方依赖，依赖 Node ≥ 22 原生 TS 执行 + 原生测试运行器：

```bash
npm test -w @imskin/pinyin-engine     # 或： node --test packages/pinyin-engine/test/*.test.ts
```

当前 30 个测试覆盖音节表、分词歧义/增量、T9、词库、引擎排序与翻页。

## 已知边界（诚实标注）

- **种子词库覆盖有限**：常见字词打得出；生僻/长尾需接入完整词库（§11.3）。
- **未做**：模糊音（z/zh、n/l…）、简拼、整句输入、个性化学习——预览达到"日常顺畅"即可，
  不追商用输入法智能度（架构 §4.3 明确）。这些可作为后续增强项。
