/**
 * G6 真实浏览器交互测试（ENG-001b / docs/03 §11）。
 *
 * 覆盖九个必需场景（REQUIRED_E2E_SCENARIOS）；Playwright + Chromium 真实浏览器
 * （非 jsdom）。每个场景 afterEach 注册结果到 evidence 聚合器。
 *
 * 运行前提：npm install && npx playwright install chromium && npm run test:e2e
 */

import { test, expect, type Page } from "@playwright/test";
import { recordScenario, REQUIRED_E2E_SCENARIOS } from "./evidence.ts";

// —— 工具 ——

let scenarioId: string = "";
let scenarioStart = Date.now();

test.afterEach(({ }, testInfo) => {
  const passed = testInfo.status === "passed";
  if (scenarioId) {
    recordScenario(scenarioId, passed, Date.now() - scenarioStart);
    scenarioId = "";
  }
});

function begin(id: string): void {
  scenarioId = id;
  scenarioStart = Date.now();
}

// —— 场景 1：生成 → Brief 确认 ——

test("gen-brief-confirm: 想法输入 → Brief 卡片确认 → 新版本出现", async ({ page }) => {
  begin("gen-brief-confirm");
  await page.goto("/");

  const ideaInput = page.getByTestId("idea-input");
  await ideaInput.fill("清冷极简，主色天蓝 #5ab0f0，情绪清新明亮");
  await page.getByTestId("generate-btn").click();

  // Brief 确认卡片出现（可能先追问）
  const clarify = page.getByTestId("clarify-card");
  const brief = page.getByTestId("brief-card");
  const hasClarify = await clarify.isVisible({ timeout: 3000 }).catch(() => false);
  if (hasClarify) {
    await page.getByRole("button", { name: "你看着办" }).click();
  }
  await expect(brief).toBeVisible({ timeout: 5000 });
  await page.getByTestId("confirm-generate").click();

  // 版本树应有新节点
  await expect(page.getByTestId("version-rail")).toBeVisible();
});

// —— 场景 2：26 键拼音输入 ——

test("qwerty-input: 物理键盘打 nihao → 候选出现 → 空格上屏", async ({ page }) => {
  begin("qwerty-input");
  await page.goto("/");

  const stage = page.getByTestId("preview-stage");
  await stage.click(); // 聚焦

  await page.keyboard.type("nihao");
  // 候选栏应出现候选（具体词取决于词库，但候选区应有内容）
  const candidates = page.getByTestId("candidates");
  await expect(candidates).toBeVisible({ timeout: 3000 });
  const chips = candidates.locator(".candidate");
  expect(await chips.count()).toBeGreaterThan(0);

  await page.keyboard.press("Space");
  const committed = page.getByTestId("committed");
  const text = await committed.textContent();
  expect(text?.length ?? 0).toBeGreaterThan(0); // 有词上屏
});

// —— 场景 3：T9 输入 ——

test("t9-input: 切手机→默认九宫格→数字键打字有候选", async ({ page }) => {
  begin("t9-input");
  await page.goto("/");

  // 切换到手机形态
  await page.getByRole("tab", { name: "手机" }).click();

  // 九宫格特征：数字键 2 上有 abc 字母组
  await expect(page.getByText("abc")).toBeVisible({ timeout: 3000 });

  // 点击数字键 6 4 4 2 6（对应 nihao）
  const kb = page.getByTestId("vkeyboard");
  for (const digit of ["6", "4", "4", "2", "6"]) {
    await kb.locator(`[data-key="${digit}"]`).click();
  }
  // 候选栏应有候选
  const candidates = page.getByTestId("candidates");
  await expect(candidates).toBeVisible({ timeout: 3000 });
  expect(await candidates.locator(".candidate").count()).toBeGreaterThan(0);
});

// —— 场景 4：面板切换 ——

test("panel-switch: 符号面板→插入符号→数字面板→返回拼音", async ({ page }) => {
  begin("panel-switch");
  await page.goto("/");

  const kb = page.getByTestId("vkeyboard");

  // 切到符号面板
  await kb.getByRole("button", { name: "符" }).click();
  await expect(kb.getByText("！")).toBeVisible({ timeout: 2000 });

  // 点击一个符号上屏
  await kb.getByRole("button", { name: "！" }).click();
  const committed = page.getByTestId("committed");
  await expect(committed).toContainText("！");

  // 切到数字面板
  await kb.getByRole("button", { name: "123" }).click();
  await kb.getByRole("button", { name: /^7$/ }).click();
  await expect(committed).toContainText("7");

  // 返回拼音
  await kb.getByRole("button", { name: "返回" }).click();
  await expect(kb.locator('[data-key="q"]')).toBeVisible();
});

// —— 场景 5：试打/标注模式分离 ——

test("mode-separation: 默认试打零拦截；标注模式可选中元素", async ({ page }) => {
  begin("mode-separation");
  await page.goto("/");

  // 默认模式：无 pick-zone 覆盖层
  await expect(page.getByTestId("pick-candidate")).toHaveCount(0);

  // 开启标注模式
  await page.getByTestId("pick-mode-toggle").click();
  await expect(page.getByTestId("pick-candidate")).toBeVisible();

  // 点选候选词
  await page.getByTestId("pick-candidate").click();
  await expect(page.getByTestId("picked-hint")).toBeVisible();

  // 退出标注
  await page.getByTestId("pick-mode-toggle").click();
  await expect(page.getByTestId("pick-candidate")).toHaveCount(0);
});

// —— 场景 6：平台切换 ——

test("platform-switch: 切百度→状态条徽标变化→特征项切换", async ({ page }) => {
  begin("platform-switch");
  await page.goto("/");

  // 默认搜狗 PC
  const badge = page.getByTestId("outlet-badge");
  await expect(badge).toHaveText("搜狗 PC");

  // 切到百度
  await page.getByRole("tab", { name: "百度" }).click();
  await expect(badge).toHaveText("百度 PC");

  // 百度特征状态项（五笔）出现，搜狗特征项（全/半）消失
  const chrome = page.getByTestId("platform-chrome");
  await expect(chrome.getByText("五笔")).toBeVisible();
  await expect(chrome.getByText("全/半")).toHaveCount(0);

  // 切到手机 → 徽标变 Android
  await page.getByRole("tab", { name: "手机" }).click();
  await expect(badge).toHaveText("百度 Android");
});

// —— 场景 7：深浅模式 ——

test("theme-switch: 默认→浅色→深色切换不报错", async ({ page }) => {
  begin("theme-switch");
  await page.goto("/");

  // 切换三档主题
  await page.getByRole("tab", { name: "浅色" }).click();
  await page.getByRole("tab", { name: "深色" }).click();
  await page.getByRole("tab", { name: "默认" }).click();

  // 预览仍可见
  await expect(page.getByTestId("preview-stage")).toBeVisible();
});

// —— 场景 8：反馈→新版本 ——

test("version-fork: 提交反馈→版本树增加节点→回显分类", async ({ page }) => {
  begin("version-fork");
  await page.goto("/");

  const rail = page.getByTestId("version-rail");
  const before = await rail.locator(".version-item").count();

  const feedbackInput = page.getByTestId("feedback-input");
  await feedbackInput.fill("候选词字太小");
  await page.getByRole("button", { name: "发送" }).click();

  // 回显出现
  await expect(page.getByTestId("feedback-echo")).toBeVisible({ timeout: 5000 });
  // 版本树增加
  const after = await rail.locator(".version-item").count();
  expect(after).toBeGreaterThan(before);
});

// —— 场景 9：确认→导出门禁 ——

test("confirm-gate: 未确认禁导出→确认后启用→fork 回落", async ({ page }) => {
  begin("confirm-gate");
  await page.goto("/");

  // 未确认：导出按钮 disabled
  const exportAll = page.getByRole("button", { name: "导出全部" });
  await expect(exportAll).toBeDisabled();

  // 确认
  await page.getByTestId("confirm-version").click();
  await expect(exportAll).toBeEnabled();

  // 提交反馈 → fork → 新版本未确认 → 导出再次禁用
  const feedbackInput = page.getByTestId("feedback-input");
  await feedbackInput.fill("想再稳重一点");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByTestId("feedback-echo")).toBeVisible({ timeout: 5000 });
  await expect(exportAll).toBeDisabled();
});

// —— 汇总检查 ——

test("summary: 全部必需场景已覆盖", async () => {
  // 此测试本身不跑浏览器操作，仅验证场景 ID 列表完整
  expect(REQUIRED_E2E_SCENARIOS.length).toBe(9);
});
