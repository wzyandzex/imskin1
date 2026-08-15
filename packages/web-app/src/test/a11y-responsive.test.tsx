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

describe("UX-005 无障碍与窄屏", () => {
  test("设置层 dialog 语义：role=dialog + aria-modal，Esc 关闭，焦点返回触发按钮", async () => {
    const user = userEvent.setup();
    render(<App />);
    const opener = screen.getByTestId("settings-menu-btn");
    await user.click(opener);
    await user.click(screen.getByTestId("menu-open-settings"));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("设置");

    // Esc 关闭 + 焦点还给打开者
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("settings-page")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  test("工具栏 tab 语义：role=tab + aria-selected 随激活态切换", async () => {
    const user = userEvent.setup();
    render(<App />);
    const tablist = screen.getByRole("tablist", { name: "预览目标平台" });
    const sogou = within(tablist).getByRole("tab", { name: "搜狗" });
    const baidu = within(tablist).getByRole("tab", { name: "百度" });
    expect(sogou.getAttribute("aria-selected")).toBe("true");
    expect(baidu.getAttribute("aria-selected")).toBe("false");

    await user.click(baidu);
    expect(baidu.getAttribute("aria-selected")).toBe("true");
    expect(sogou.getAttribute("aria-selected")).toBe("false");

    // 设备组也是合法 tablist/tab
    const devList = screen.getByRole("tablist", { name: "预览设备" });
    expect(within(devList).getAllByRole("tab").length).toBe(2);
  });

  test("live region：对话流 aria-live，反馈回显出现即被播报", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId("chat-log").getAttribute("aria-live")).toBe("polite");

    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    const echo = screen.getByTestId("feedback-echo");
    expect(echo.getAttribute("aria-live")).toBe("polite");
    expect(echo.textContent).toContain("具体参数");
  });

  test("对话栏开关：隐藏后可再唤出，并在对话栏内完成一次反馈闭环（窄屏抽屉的 DOM 等价）", async () => {
    const user = userEvent.setup();
    render(<App />);
    // 开关始终存在（窄屏抽屉的唤出入口）
    const toggle = screen.getByTestId("chat-toggle");
    await user.click(toggle);
    expect(screen.queryByTestId("chat-rail")).toBeNull();
    await user.click(toggle);
    expect(screen.getByTestId("chat-rail")).toBeTruthy();

    const before = versionCount();
    await user.type(screen.getByTestId("feedback-input"), "想再稳重一点");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(versionCount()).toBe(before + 1);
    expect(screen.getByTestId("feedback-echo")).toBeTruthy();
  });
});
