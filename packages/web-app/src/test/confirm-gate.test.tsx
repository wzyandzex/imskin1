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

function currentStatus() {
  const rail = screen.getByTestId("version-rail");
  const active = within(rail).getAllByRole("button").find((b) => b.classList.contains("version-item") && b.classList.contains("active"));
  return active?.querySelector(".v-status")?.textContent ?? "";
}

describe("UX-003 定稿确认门禁", () => {
  test("未确认：导出按钮禁用 + 门禁提示可见；确认按钮存在", () => {
    render(<App />);
    expect(screen.getByTestId("confirm-version")).toBeTruthy();
    expect(screen.getByTestId("export-gate").textContent).toContain("确认此版本");
    const exportBtn = screen.getByRole("button", { name: /导出 \.ssf/ });
    const exportAll = screen.getByRole("button", { name: "导出全部" });
    expect((exportBtn as HTMLButtonElement).disabled).toBe(true);
    expect((exportAll as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("confirmed-badge")).toBeNull();
  });

  test("确认后：徽标替换按钮、导出启用、版本树状态 confirmed、刷新不丢", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByTestId("confirm-version"));

    expect(screen.getByTestId("confirmed-badge").textContent).toContain("已确认");
    expect(screen.queryByTestId("confirm-version")).toBeNull();
    expect(screen.queryByTestId("export-gate")).toBeNull();
    expect((screen.getByRole("button", { name: /导出 \.ssf/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "导出全部" }) as HTMLButtonElement).disabled).toBe(false);
    expect(currentStatus()).toBe("confirmed");

    // 持久化：刷新（重挂载）后确认状态保留
    unmount();
    render(<App />);
    expect(screen.getByTestId("confirmed-badge")).toBeTruthy();
    expect((screen.getByRole("button", { name: "导出全部" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("确认后提反馈：fork 新版本自动回到未确认，导出再次禁用", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("confirm-version"));
    expect((screen.getByRole("button", { name: "导出全部" }) as HTMLButtonElement).disabled).toBe(false);

    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));

    // 新版本未继承确认
    expect(screen.getByTestId("confirm-version")).toBeTruthy();
    expect(screen.getByTestId("export-gate")).toBeTruthy();
    expect((screen.getByRole("button", { name: "导出全部" }) as HTMLButtonElement).disabled).toBe(true);
    expect(currentStatus()).not.toBe("confirmed");
  });
});

describe("QA-001 四出口交付状态卡", () => {
  test("状态卡列出四口等级与缺口；确认版本后确认缺口消失、位图缺口仍在（诚实）", async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const o of ["sogou_pc", "sogou_android", "baidu_pc", "baidu_android"]) {
      const row = screen.getByTestId(`outlet-status-${o}`);
      expect(row.textContent).toContain("structural");
    }
    // 未确认：四口都有确认缺口提示
    expect(screen.getByTestId("outlet-status-sogou_pc").textContent).toContain("确认此版本");

    await user.click(screen.getByTestId("confirm-version"));
    const sgRow = screen.getByTestId("outlet-status-sogou_pc");
    expect(sgRow.textContent).not.toContain("确认此版本");
    // A3-001 后：状态栏图标已闭合 → sogou_pc 无缺口（install_candidate）
    expect(sgRow.textContent).toContain("install_candidate");
    expect(sgRow.textContent).not.toContain("ASSET_MISSING");
    // 未接校验器的出口显示 not_run
    expect(screen.getByTestId("outlet-status-baidu_pc").textContent).toContain("STRUCTURAL_NOT_RUN");
  });
});
