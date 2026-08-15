import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
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

describe("设置中心 + 键盘快捷键", () => {
  test("左下角控制条：设置(带标签) + 帮助占位", () => {
    render(<App />);
    expect(screen.getByTestId("corner-bar")).toBeTruthy();
    expect(screen.getByTestId("settings-menu-btn").textContent).toContain("IMSkin");
    expect(screen.getByTestId("help-btn")).toBeTruthy();
  });

  test("点设置 → 上弹菜单 → 点「设置」进设置页", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("settings-menu-btn"));
    expect(screen.getByTestId("corner-menu")).toBeTruthy();
    await user.click(screen.getByTestId("menu-open-settings"));
    expect(screen.getByTestId("settings-page")).toBeTruthy();
  });

  test("设置页：左侧导航含「常规 / 键盘快捷键」，可切换", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("settings-menu-btn"));
    await user.click(screen.getByTestId("menu-open-settings"));
    expect(screen.getByTestId("settings-general")).toBeTruthy();
    await user.click(screen.getByTestId("settings-cat-shortcuts"));
    expect(screen.getByTestId("settings-shortcuts")).toBeTruthy();
    // 默认列出注册表动作
    expect(screen.getByTestId("shortcut-row-toggle-chat")).toBeTruthy();
    expect(screen.getByTestId("shortcut-row-open-settings")).toBeTruthy();
  });

  test("「← 返回应用」退出设置页", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("settings-menu-btn"));
    await user.click(screen.getByTestId("menu-open-settings"));
    await user.click(screen.getByTestId("settings-back"));
    expect(screen.queryByTestId("settings-page")).toBeNull();
  });

  test("快捷键页显示默认绑定（Ctrl+J / Ctrl+,），重置默认未分配", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("settings-menu-btn"));
    await user.click(screen.getByTestId("menu-open-settings"));
    await user.click(screen.getByTestId("settings-cat-shortcuts"));
    const row = screen.getByTestId("shortcut-row-toggle-chat");
    expect(row.textContent).toContain("Ctrl+J");
    expect(screen.getByTestId("shortcut-row-open-settings").textContent).toContain("Ctrl+,");
    expect(screen.getByTestId("shortcut-row-reset-project").textContent).toContain("未分配");
  });

  test("重新绑定快捷键：捕获按键并更新", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("settings-menu-btn"));
    await user.click(screen.getByTestId("menu-open-settings"));
    await user.click(screen.getByTestId("settings-cat-shortcuts"));
    await user.click(screen.getByTestId("shortcut-edit-toggle-chat"));
    const capture = screen.getByTestId("shortcut-capture-toggle-chat");
    fireEvent.keyDown(capture, { key: "K", ctrlKey: true });
    expect(screen.getByTestId("shortcut-row-toggle-chat").textContent).toContain("Ctrl+K");
  });

  test("冲突检测：绑定到已占用按键 → 提示冲突", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("settings-menu-btn"));
    await user.click(screen.getByTestId("menu-open-settings"));
    await user.click(screen.getByTestId("settings-cat-shortcuts"));
    await user.click(screen.getByTestId("shortcut-edit-reset-project"));
    fireEvent.keyDown(screen.getByTestId("shortcut-capture-reset-project"), { key: "J", ctrlKey: true });
    expect(screen.getByTestId("shortcut-conflict").textContent).toContain("Ctrl+J");
  });

  test("全局快捷键：Ctrl+J 开合对话栏（输入框内不触发）", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId("chat-rail")).toBeTruthy();
    // 在 window 上触发 Ctrl+J → 收起
    fireEvent.keyDown(window, { key: "j", code: "KeyJ", ctrlKey: true });
    expect(screen.queryByTestId("chat-rail")).toBeNull();
    fireEvent.keyDown(window, { key: "j", code: "KeyJ", ctrlKey: true });
    expect(screen.getByTestId("chat-rail")).toBeTruthy();
    // 焦点在输入框里 → 不触发
    const input = screen.getByTestId("idea-input");
    await user.click(input);
    fireEvent.keyDown(input, { key: "j", code: "KeyJ", ctrlKey: true });
    expect(screen.getByTestId("chat-rail")).toBeTruthy();
  });

  test("全局快捷键：Ctrl+, 打开/关闭设置页", () => {
    render(<App />);
    expect(screen.queryByTestId("settings-page")).toBeNull();
    fireEvent.keyDown(window, { key: ",", code: "Comma", ctrlKey: true });
    expect(screen.getByTestId("settings-page")).toBeTruthy();
    fireEvent.keyDown(window, { key: ",", code: "Comma", ctrlKey: true });
    expect(screen.queryByTestId("settings-page")).toBeNull();
  });
});

describe("自定义 Tooltip", () => {
  test("悬停对话栏开合按钮 → 弹出带 kbd 的气泡", async () => {
    const user = userEvent.setup();
    render(<App />);
    const btn = screen.getByTestId("chat-toggle");
    await user.hover(btn);
    // 延迟后出现
    await act(async () => { await new Promise((r) => setTimeout(r, 340)); });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("对话栏");
    expect(tip.textContent).toContain("Ctrl+J");
  });

  test("悬停设置按钮 → 气泡弹出且带 kbd（方向自动翻转）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.hover(screen.getByTestId("settings-menu-btn"));
    await act(async () => { await new Promise((r) => setTimeout(r, 340)); });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("设置");
    expect(tip.textContent).toContain("Ctrl+,");
  });
});
