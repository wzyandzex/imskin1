# 搜狗 PC 真机安装验证指引（EVID-001）

> 目标：把 `sogou_pc` 从 `structural` 抬到 `install_verified`——**唯一**能对用户称"可安装包"的等级（docs/00 §1 / ADR-001）。
> 规范：manifest 格式见 `docs/05-风险登记与证据包规范.md` §6；本目录一次验证一个子目录，不覆盖历史。

## 你（验证人）需要做的

### 1. 准备

- [ ] 在一台 Windows 机器上，从**搜狗官网**安装搜狗输入法 PC 版（不要用论坛/网盘镜像）；记录版本号（设置 → 关于）。
- [ ] 生成本次验证用包（实验链路，直到 ASSET/QA 闸门放开后改走确认链路）：
  ```bash
  node packages/api/src/cli.ts generate "清冷极简，主色天蓝 #5ab0f0" --name evid01 --out ./out --confirm
  ```
- [ ] 生成证据骨架（锁定该包的 SHA-256）：
  ```bash
  node packages/api/src/cli.ts evidence --artifact ./out/evid01-sogou-pc.ssf \
    --client "搜狗输入法" --client-version "<你看到的版本号>" \
    --out docs/evidence/outlets/sogou-pc/<版本号>/manifest.json
  ```

### 2. 执行七个必需场景（对应 manifest.requiredScenarios）

| id | 动作 | 通过标准 |
|---|---|---|
| recognized | 双击 .ssf（或右键用搜狗打开） | 弹出安装/导入提示而非报错 |
| installed | 完成安装 | 提示成功 |
| listed | 打开皮肤列表 | 出现"evid01"（或皮肤名） |
| enabled | 启用该皮肤 | 当前输入法外观切换为本皮肤 |
| visuals | 打字观察 | 候选窗/拼音串/状态栏按皮肤显示、颜色正确、无缺图 |
| states | 切中英文、候选翻页 | 各状态正常渲染 |
| restart | 重启输入法/电脑后启用 | 皮肤仍存在且可用 |

每项截图放本目录 `screenshots/`（命名 `01-recognized.png` 起）。

### 3. 回填 manifest

把 `scenarios` 各项 `result` 改为 `pass`/`fail`（附 note）；任何失败记入 `failures`（失败也是证据——据此回写字段字典与风险台账 R-01）。

### 4. 声明规则（硬性）

- 七项全 `pass` → 才可把 `deliveryLevelClaim` 改为 `install_verified`，并同步 `docs/02` 平台矩阵升级 `sogou_pc`。
- 任一 `fail`/`pending` → 出口保持 `structural`，UI 文案不变。

## 当前状态

**本目录尚无已归档验证**——`sogou_pc` 为 `structural`（配置骨架 + 结构校验通过；缺真实位图资产，见导出面板"四出口交付状态"卡）。
