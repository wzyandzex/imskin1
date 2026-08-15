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

describe("FR-QA-3 深浅双模式", () => {
  test("提供 默认/浅色/深色 三档预览切换", async () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: "默认" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "浅色" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "深色" })).toBeTruthy();
  });

  test("切到深色模式：预览皮肤变深（背景亮度下降）", async () => {
    const user = userEvent.setup();
    render(<App />);
    // 默认初始皮肤是浅色（清新薄荷）
    const stageBefore = screen.getByTestId("preview-stage");
    const before = stageBefore.innerHTML;

    await user.click(screen.getByRole("tab", { name: "深色" }));
    const stageAfter = screen.getByTestId("preview-stage");
    // 深色变体渲染后预览内容变化（背景/文字色不同）
    expect(stageAfter.innerHTML).not.toBe(before);
  });

  test("深浅切换不影响版本树（预览态切换不产生新版本）", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rail = screen.getByTestId("version-rail");
    const before = within(rail).getAllByRole("button", { name: /.*/ }).filter((b) => b.classList.contains("version-item")).length;
    await user.click(screen.getByRole("tab", { name: "深色" }));
    await user.click(screen.getByRole("tab", { name: "浅色" }));
    await user.click(screen.getByRole("tab", { name: "默认" }));
    const after = within(rail).getAllByRole("button").filter((b) => b.classList.contains("version-item")).length;
    expect(after).toBe(before);
  });
});
