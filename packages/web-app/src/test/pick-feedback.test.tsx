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

function versionCount() {
  return within(screen.getByTestId("version-rail")).getAllByRole("button").filter((b) => b.classList.contains("version-item")).length;
}

describe("FR-FEEDBACK-5 细粒度点选反馈", () => {
  test("预览上有多个细粒度可点选区（候选词/选中候选/拼音串/字母键/功能键/键盘背景/候选栏背景）", async () => {
    render(<App />);
    for (const k of ["candidate", "candidate-selected", "composing", "key", "key-special", "keyboard-bg", "candidate-bg"]) {
      expect(screen.getByTestId(`pick-${k}`)).toBeTruthy();
    }
  });

  test("点选「候选词」→ 出现已点选提示（只改这一块）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("pick-candidate"));
    const hint = screen.getByTestId("picked-hint");
    expect(hint.textContent).toContain("候选词");
    expect(hint.textContent).toContain("只改这一块");
  });

  test("点选「功能键」→ 提示指向功能键；再点一次取消", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("pick-key-special"));
    expect(screen.getByTestId("picked-hint").textContent).toContain("功能键");
    await user.click(screen.getByTestId("pick-key-special"));
    expect(screen.queryByTestId("picked-hint")).toBeNull();
  });

  test("点选「字母键」+ 反馈「字太小」→ 定向改按键字号，产生新版本", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = versionCount();
    await user.click(screen.getByTestId("pick-key"));
    await user.type(screen.getByTestId("feedback-input"), "字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(versionCount()).toBe(before + 1);
    expect(screen.getByTestId("feedback-echo").textContent).toContain("字母键");
    expect(screen.queryByTestId("picked-hint")).toBeNull();
  });

  test("点选「候选词」+ 反馈「字太小」→ 定向改候选栏字号", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = versionCount();
    await user.click(screen.getByTestId("pick-candidate"));
    await user.type(screen.getByTestId("feedback-input"), "字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(versionCount()).toBe(before + 1);
    expect(screen.getByTestId("feedback-echo").textContent).toContain("候选词");
  });

  test("点选后反馈 placeholder 变为针对该元素", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("pick-candidate"));
    expect((screen.getByTestId("feedback-input") as HTMLInputElement).placeholder).toContain("候选词");
  });
});
