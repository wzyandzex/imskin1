import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "../App.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

/** 通过左下角设置入口进设置页，切到「接入模型」分类。 */
async function openModelSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-menu-btn"));
  await user.click(screen.getByTestId("menu-open-settings"));
  await user.click(screen.getByTestId("settings-cat-models"));
}

/** 添加一套配置并填入字段（添加后默认已展开编辑区）。 */
async function addModelConfig(user: ReturnType<typeof userEvent.setup>, baseUrl: string, model: string, label = "测试模型") {
  await user.click(screen.getByTestId("model-add"));
  const cards = screen.getAllByTestId(/model-card-/);
  const id = cards[cards.length - 1]!.getAttribute("data-testid")!.replace("model-card-", "");
  await user.type(screen.getByTestId(`model-label-${id}`), label);
  // 确保编辑区展开（添加时已展开，若已收起则点开）
  if (!screen.queryByTestId(`model-baseurl-${id}`)) {
    await user.click(screen.getByTestId(`model-toggle-edit-${id}`));
  }
  await user.type(screen.getByTestId(`model-baseurl-${id}`), baseUrl);
  await user.type(screen.getByTestId(`model-model-${id}`), model);
  return id;
}

describe("前端 LLM 接入（设置页多配置管理）", () => {
  test("设置页有「接入模型」分类，可添加配置并填字段", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openModelSettings(user);
    expect(screen.getByTestId("settings-models")).toBeTruthy();
    await user.click(screen.getByTestId("model-add"));
    const cards = screen.getAllByTestId(/model-card-/);
    const id = cards[cards.length - 1]!.getAttribute("data-testid")!.replace("model-card-", "");
    // 添加后默认展开编辑区
    expect(screen.getByTestId(`model-baseurl-${id}`)).toBeTruthy();
    expect(screen.getByTestId(`model-model-${id}`)).toBeTruthy();
    expect(screen.getByTestId(`model-apikey-${id}`)).toBeTruthy();
  });

  test("配置 baseUrl+model 后启用，生成走 LLM（成功）并回显来源", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ styleKeywords: ["极简", "水墨"], palette: { primary: "#2b2b33" }, mood: "沉静内敛" }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
    const user = userEvent.setup();
    render(<App />);
    await openModelSettings(user);
    const id = await addModelConfig(user, "https://api.test/v1", "test-model");
    // 启用 + 设为当前
    await user.click(screen.getByTestId(`model-activate-${id}`));
    // 返回应用
    await user.click(screen.getByTestId("settings-back"));

    // 生成
    await user.type(screen.getByTestId("idea-input"), "想要水墨风");
    await user.click(screen.getByRole("button", { name: "生成" }));

    // 回显"已用你的模型"
    const status = await screen.findByTestId("llm-status");
    expect(status.textContent).toContain("你的模型");
    expect(await screen.findByTestId("brief-card")).toBeTruthy();
  });

  test("LLM 失败（网络错）→ 自动降级，回显「已用内置理解」", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const user = userEvent.setup();
    render(<App />);
    await openModelSettings(user);
    const id = await addModelConfig(user, "https://api.test/v1", "test-model");
    await user.click(screen.getByTestId(`model-activate-${id}`));
    await user.click(screen.getByTestId("settings-back"));

    await user.type(screen.getByTestId("idea-input"), "极简风格，主色天蓝 #5ab0f0，情绪清新明亮");
    await user.click(screen.getByRole("button", { name: "生成" }));

    const status = await screen.findByTestId("llm-status");
    expect(status.textContent).toContain("内置理解");
    expect(await screen.findByTestId("brief-card")).toBeTruthy();
  });

  test("配置持久化到 localStorage（v2 多配置格式）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openModelSettings(user);
    await addModelConfig(user, "http://localhost:11434/v1", "qwen2.5", "本地Qwen");
    const raw = localStorage.getItem("imskin:llm:v2");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.configs[0].model).toBe("qwen2.5");
    expect(parsed.configs[0].enabled).toBe(true);
  });

  test("输入区显示模型切换器，点击弹两级菜单可切模型/强度", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
    const user = userEvent.setup();
    render(<App />);
    await openModelSettings(user);
    const id = await addModelConfig(user, "https://api.test/v1", "test-model", "我的模型");
    await user.click(screen.getByTestId(`model-activate-${id}`));
    await user.click(screen.getByTestId("settings-back"));

    // 输入区有切换器，显示当前模型名
    const sw = screen.getByTestId("model-switcher");
    expect(sw.textContent).toContain("我的模型");

    // 点击弹菜单
    await user.click(sw);
    expect(screen.getByTestId("ms-menu")).toBeTruthy();
    // 进模型子面板
    await user.click(screen.getByTestId("ms-goto-models"));
    expect(screen.getByTestId("ms-subpane-models")).toBeTruthy();
    // 进强度子面板
    await user.click(screen.getByTestId("ms-back-models"));
    await user.click(screen.getByTestId("ms-goto-tier"));
    expect(screen.getByTestId("ms-subpane-tier")).toBeTruthy();
  });
});
