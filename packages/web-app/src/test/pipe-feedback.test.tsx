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

describe("PIPE-001 平台定向反馈（Web）", () => {
  test("'百度这边候选词字太小' → 回显 scope 写明百度并只路由百度适配层", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = versionCount();

    await user.type(screen.getByTestId("feedback-input"), "百度这边候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));

    const echo = screen.getByTestId("feedback-echo");
    expect(echo.textContent).toContain("百度");
    expect(echo.textContent).toContain("平台适配层");
    expect(versionCount()).toBe(before + 1);
  });

  test("无厂商指代的平台反馈 → scope 泛化（不点名具体厂商）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "这个平台的布局要调");
    await user.click(screen.getByRole("button", { name: "发送" }));
    const echo = screen.getByTestId("feedback-echo");
    expect(echo.textContent).toContain("对应（搜狗/百度）");
  });
});
