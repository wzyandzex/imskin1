# 证据索引

> 本目录存放外部事实与交付验证的可审计证据。规范见 `docs/05-风险登记与证据包规范.md`。

## 目录规则

```text
outlets/<outlet>/<client-version>/    # 出口安装验证（一次一目录，不覆盖）
pinyin-benchmarks/<dataset-version>/  # 词库覆盖与延迟基准
visual-golden/<fixture-id>/           # 视觉回归基准
performance/<date>-<env>/             # 性能基准报告
security/<date>-<scope>/              # 安全测试记录
```

## 当前状态（2026-08-15）

**本目录尚无任何已归档证据。**

这意味着：

- 四个出口均为 `structural`，无一达到 `previewable / install_candidate / install_verified`；
- 不存在真实客户端安装记录；
- 不存在词库覆盖率基准；
- 不存在性能/安全基准报告。

第一份证据目标（按 `docs/06-路线图`）：

1. `outlets/sogou-pc/<version>/` —— EVID-001 产出；
2. `pinyin-benchmarks/initial/` —— PINYIN-001 产出。

## 新增证据检查表

- [ ] 目录名符合 `<outlet>/<client-version>` 或 `<类型>/<版本>`；
- [ ] manifest.json 字段完整（见规范 §6/§7）；
- [ ] artifact sha256 与实际文件一致；
- [ ] requiredScenarios 全 pass（或如实标 fail）；
- [ ] 不含账号/密钥/未授权素材；
- [ ] 已在 `docs/02-平台能力矩阵` 或风险台账登记引用；
- [ ] 证据等级（E0–E5）已标注。
