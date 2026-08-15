# IMSkin — 输入法皮肤生成与真实交互预览工作台

用一段想法（可带参考图/视频）生成输入法皮肤设计，在网页里**像真的打字一样**实时预览、多轮自然语言反馈迭代，并在用户确认后导出目标平台皮肤包。

> **当前产品阶段（诚实声明）**：原型/MVP。四个格式适配器已落地（结构可生成），但**真实客户端安装验证与真实位图资产尚未完成**——当前导出为实验/预览级产物，不承诺"开箱可安装"。每个出口的交付状态见 [`docs/02-平台能力矩阵与适配契约.md`](./docs/02-平台能力矩阵与适配契约.md)。

## 文档导航（单一事实源）

| 文档 | 职责 |
|---|---|
| [`docs/00-总规划与开发基线.md`](./docs/00-总规划与开发基线.md) | **开发总入口**：阶段定义、出口交付等级、路线 |
| [`需求规格说明书.md`](./需求规格说明书.md) | 产品需求与验收标准（v1.3） |
| [`架构设计.md`](./架构设计.md) | 模块边界与架构决策（v3.0） |
| [`docs/01-领域模型与数据契约.md`](./docs/01-领域模型与数据契约.md) | 领域对象、状态机、schema |
| [`docs/02-平台能力矩阵与适配契约.md`](./docs/02-平台能力矩阵与适配契约.md) | 四出口事实与状态 |
| [`docs/03-质量门禁与验收协议.md`](./docs/03-质量门禁与验收协议.md) | 发布 Gate 与证据 |
| [`docs/04-工程规范与测试策略.md`](./docs/04-工程规范与测试策略.md) | 代码/测试/CI 规范 |
| [`docs/05-风险登记与证据包规范.md`](./docs/05-风险登记与证据包规范.md) | 风险台账与证据格式 |
| [`docs/06-路线图与任务分解.md`](./docs/06-路线图与任务分解.md) | 可执行任务清单 |
| [`docs/adr/`](./docs/adr/) | 架构决策记录（ADR-001..008） |
| [`项目状态与交付.md`](./项目状态与交付.md) | 当前快照（动态更新） |
| [`市场调研与产品启示.md`](./市场调研与产品启示.md) | 调研证据（不作为验收依据） |
| [`docs/archive/2026-08-15/`](./docs/archive/2026-08-15/) | 历史文档归档 |

## 工程结构

```text
packages/
  pinyin-engine/         拼音输入内核（26 键 + T9）
  skin-gen/              设计意图 → 视觉 token → 皮肤（含可读性 QA）
  project-model/         版本树（fork/血缘/元素合并/满意标记）
  feedback-core/         反馈分类 → 路由 → 定向最小修改
  qa-core/               可读性 / 一致性校验
  zip/                   零依赖 store-zip + CRC32 + MD5 + UTF-16LE
  sogou-adapter/         搜狗 PC .ssf
  sogou-mobile-adapter/  搜狗 Android .ssf
  baidu-pc-adapter/      百度 PC .bps
  baidu-mobile-adapter/  百度 Android .bds
  orchestrator/          A1..A6 编排 + 四出口导出
  llm-core/              LLM 接入层（可选，OpenAI 兼容/Ollama + 确定性降级）
  api/                   本地 REST/CLI/SDK（自托管）
  web-app/               React 工作台 + 实时预览运行时
```

测试统计**以命令输出为准**（统一统计脚本落地前不手写数字，见 `docs/04` §6）。

> **iOS 边界**：百度/搜狗 iOS 输入法受系统扩展沙盒限制，无外部皮肤包导入通道；"移动端"在本文档体系中统一指 Android。

## 当前能力边界

**可以做**（浏览器内闭环）：

- 想法 → 追问 → Brief 确认 → 生成（含可读性自检）；
- PC/手机真实虚拟键盘试打（拼音引擎、T9、按键音、上滑/长按次字符）；
- 自然语言/点选反馈 → 定向修改 → 版本树 fork/对比；
- 深浅双模式变体、多档 DPI 预览、项目文件导出/导回；
- 导出四出口**结构包**（配置骨架为主，实验级）。

**尚不可承诺**（见 `docs/05` 风险台账）：

- 任何出口的**真机安装**（四出口均为 `structural` 等级）；
- 默认导出包含完整真实位图/移动布局；
- 搜狗/百度平台差异预览（PRE-001 完成前，平台切换仅影响导出分支）；
- 符号/数字面板切换（UX-001 完成前为未接通状态）。

## 快速开始

```bash
# 安装（本机 npm 缓存有 EPERM 时用本地缓存）
npm install --cache ./.npm-cache

# 前端工作台 → http://localhost:5173/
npm run dev -w @imskin/web-app

# 全部 workspace 测试
npm test

# 前端测试 / 类型检查 / 构建
npx vitest run --root packages/web-app
cd packages/web-app && npx tsc --noEmit && npx vite build

# 自动化 CLI：生成并导出四出口实验包 / 启动本地 REST
node packages/api/src/cli.ts generate "国潮水墨风格，主色墨黑" --out ./out
node packages/api/src/cli.ts serve --port 7317
```

LLM 接入与安全边界见 [`docs/LLM与自动化API.md`](./docs/LLM与自动化API.md) 与 ADR-005：**当前前端为浏览器直连模式，API Key 默认不应持久化**。

## 开发约定

- Node ≥ 22（CI 固定 22.x），核心逻辑包零第三方依赖，`node:test` 原生测试。
- 跨包类型逐步进 `@imskin/contracts`（DOM-001）；出口/状态枚举不得各处自定义。
- 一切外部事实（客户端接受性、字段语义）按证据等级（E0–E5）管理，见 `docs/05`。
- 当前工作区暂无 Git 元数据——GOV-002 将初始化仓库；在此之前避免不可回滚的大规模重构。
