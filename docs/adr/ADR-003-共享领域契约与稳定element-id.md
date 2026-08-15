# ADR-003 共享领域契约与稳定 element_id

- 状态：已接受（2026-08-15）
- 关联：`docs/01` §3/§7、`docs/04` §3

## 背景

跨包类型分散且部分以 `Record<string, unknown>` 传递；点选反馈靠中文关键词猜目标；`mergeElement` 只支持 data 顶层 key；element_id 从未真正存在。

## 备选方案

1. 继续各包自定义类型 + 文本提示词路由。
2. 集中 `@imskin/contracts`（类型 + 运行时 parser）+ 稳定语义 element_id 命名空间。

## 决策

方案 2。新增零依赖 contracts 包；element_id 首版命名空间见 `docs/01` §7.1（`keyboard.key.normal` 等）；反馈先产出 `ChangeInstruction`（目标元素/字段路径/操作/保留集/置信度），低置信度需用户确认目标。

## 后果

- 正面：点选/合并/满意标记/漂移检测共用同一锚点；类型变更可被测试捕获。
- 负面：命名冻结需要纪律；改名即 schema migration。

## 迁移

现有 keyword 路由保留为 fallback adapter；`mergeElement` 改为经 ElementCatalog 的 tokenPaths/assetRoles 寻址并输出 MergeRecord。

## 回退

若命名空间过严，可增设子命名空间（如 `mobile.panel.emoji.*`），根命名不得重定义。
