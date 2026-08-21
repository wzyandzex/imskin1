# E2E 测试状态（ENG-001b）

> 更新：2026-08-18 ｜ 任务：ENG-001b

## 当前状态：**BLOCKED（网络不可用）**

基础设施已完备：
- ✅ `packages/web-app/playwright.config.ts`（Chromium + Vite dev server 自动管理）
- ✅ `packages/web-app/e2e/g6-scenarios.spec.ts`（9 个必需场景，docs/03 G6 清单）
- ✅ `packages/web-app/e2e/evidence.ts`（结果聚合 → 写 `latest.json`）
- ✅ `packages/orchestrator/src/e2eGate.ts`（闸门消费：`e2eEvidencePassed()` → previewable 授予）
- ✅ 根脚本 `npm run test:e2e` + web-app `playwright test`

**阻塞项**：`@playwright/test` npm 包 + Chromium 二进制（~120MB）需要网络下载。

## 激活步骤（网络恢复后执行一次）

```bash
cd E:\Code\IMSkin-c
npm install --cache ./.npm-cache          # 安装 @playwright/test devDep
npx playwright install chromium           # 下载 Chromium 浏览器
npm run test:e2e                           # 运行 9 个 G6 场景
```

全部场景通过后 → `docs/evidence/e2e/latest.json` 自动生成（passed=true）→
交付闸门自动为 QA 通过的出口授予 **previewable**。

## 9 个必需场景（对应 latest.json 的 requiredScenarios）

| ID | 场景 |
|---|---|
| gen-brief-confirm | 想法输入 → Brief 确认 → 新版本 |
| qwerty-input | 26 键拼音输入 + 候选选词上屏 |
| t9-input | 九宫格 T9 数字键输入有候选 |
| panel-switch | 符号/数字面板切换 + 返回拼音 |
| mode-separation | 试打零拦截 / 标注模式可选中元素 |
| platform-switch | 平台×设备切换加载 PreviewProfile |
| theme-switch | 深浅模式三档切换 |
| version-fork | 反馈 → 新版本进版本树 |
| confirm-gate | 确认 → 导出启用 → fork 回落禁用 |
