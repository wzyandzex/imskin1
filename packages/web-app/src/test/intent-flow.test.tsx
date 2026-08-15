import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "../App.tsx";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("A1 意图理解前端闭环", () => {
  test("模糊想法 → 出现追问卡片（且只有一个问题），确认前不产生新版本", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rail = screen.getByTestId("version-rail");
    const before = within(rail).getAllByRole("button").length;

    await user.type(screen.getByTestId("idea-input"), "想要一个好看的皮肤");
    await user.click(screen.getByRole("button", { name: "生成" }));

    // 追问卡片出现，且只有一个问题
    const card = screen.getByTestId("clarify-card");
    expect(card).toBeTruthy();
    expect(within(card).getAllByText(/想往哪个风格方向走|主色想用哪个色系|整体情绪想偏哪种/).length).toBe(1);

    // ❌ FR-BRIEF-2：确认前不产生新版本
    expect(within(rail).getAllByRole("button").length).toBe(before);
  });

  test("追问选一个选项 → 进入 Brief 确认卡片，推断字段有高亮标注", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("idea-input"), "想要一个好看的皮肤");
    await user.click(screen.getByRole("button", { name: "生成" }));

    // 选一个风格选项
    await user.click(screen.getByRole("button", { name: "国潮水墨" }));

    // 进入确认卡片
    const card = screen.getByTestId("brief-card");
    expect(card).toBeTruthy();
    // 推断字段有"推断"角标（风格已回答→不再标推断；颜色/情绪/圆角仍推断）
    const tags = within(card).getAllByText("推断");
    expect(tags.length).toBeGreaterThan(0);
  });

  test("「你看着办」→ 跳过追问直接进确认卡片，字段标推断", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("idea-input"), "想要一个好看的皮肤");
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(screen.getByRole("button", { name: "你看着办" }));

    const card = screen.getByTestId("brief-card");
    expect(card).toBeTruthy();
    expect(within(card).getAllByText("推断").length).toBeGreaterThan(0);
  });

  test("确认卡片编辑字段后确认 → 生成新版本进时间线", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rail = screen.getByTestId("version-rail");
    const before = within(rail).getAllByRole("button").length;

    await user.type(screen.getByTestId("idea-input"), "国潮水墨风格，主色墨黑 #2b2b33，情绪沉静内敛");
    await user.click(screen.getByRole("button", { name: "生成" }));

    // 完整想法 → 跳过追问，直接进确认卡片
    const card = screen.getByTestId("brief-card");
    expect(card).toBeTruthy();

    // 编辑情绪字段
    const moodInput = within(card).getByDisplayValue("沉静内敛");
    await user.clear(moodInput);
    await user.type(moodInput, "深邃神秘");

    await user.click(screen.getByTestId("confirm-generate"));

    // 生成一个新版本
    expect(within(rail).getAllByRole("button").length).toBe(before + 1);
  });

  test("完整想法（风格+颜色+情绪）→ 跳过追问直接进确认卡片", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("idea-input"), "极简风格，主色天蓝 #5ab0f0，情绪清新明亮");
    await user.click(screen.getByRole("button", { name: "生成" }));

    // 无追问卡片，直接确认卡片
    expect(screen.queryByTestId("clarify-card")).toBeNull();
    expect(screen.getByTestId("brief-card")).toBeTruthy();
  });

  test("「返回修改」→ 回到想法输入，可重新编辑", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("idea-input"), "水墨");
    await user.click(screen.getByRole("button", { name: "生成" }));

    // 进入追问或确认
    const hasClarify = screen.queryByTestId("clarify-card");
    if (hasClarify) {
      await user.click(screen.getByRole("button", { name: "你看着办" }));
    }
    expect(screen.getByTestId("brief-card")).toBeTruthy();

    // 返回修改 → 回 idle
    await user.click(screen.getByRole("button", { name: "返回修改" }));
    expect(screen.queryByTestId("brief-card")).toBeNull();
    expect(screen.getByTestId("idea-input")).toBeTruthy();
  });
});
