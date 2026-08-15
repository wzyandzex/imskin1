import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

describe("FR-LEARN-1 偏好学习 + FR-EXPORT-2 一键修复", () => {
  test("反馈「颜色太深」→ 学到「偏好更浅的配色」并展示偏好条", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByTestId("prefs-banner")).toBeNull();
    await user.type(screen.getByTestId("feedback-input"), "按键的颜色太深");
    await user.click(screen.getByRole("button", { name: "发送" }));
    const banner = screen.getByTestId("prefs-banner");
    expect(banner.textContent).toContain("偏好更浅的配色");
  });

  test("学到的偏好可清除", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "想再稳重一点");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(screen.getByTestId("prefs-banner")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(screen.queryByTestId("prefs-banner")).toBeNull();
  });

  test("无可学信号的反馈不产生偏好条", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    // "字太小"→学"偏好更大字号"——有信号，所以此用例换个真正无信号的
    cleanup();
    localStorage.clear();
    render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "百度这边对不齐");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(screen.queryByTestId("prefs-banner")).toBeNull();
  });

  test("无 QA error 时不出一键修复条（生成即达标，无修复项）", async () => {
    render(<App />);
    // 默认皮肤已过可读性（生成即达标）→ 无 error → 无修复条
    expect(screen.queryByTestId("qa-fix-bar")).toBeNull();
  });
});
