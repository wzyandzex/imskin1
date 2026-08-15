import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "../App.tsx";
import { SkinOrchestrator } from "@imskin/orchestrator";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

function versionCount() {
  return within(screen.getByTestId("version-rail")).getAllByRole("button").filter((b) => b.classList.contains("version-item")).length;
}

describe("UX-004 反馈提交健壮性", () => {
  test("空输入：点发送不产生版本，显示字段级提示；开始输入后提示消失", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = versionCount();

    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(versionCount()).toBe(before); // 不产生半成品版本
    const hint = screen.getByTestId("feedback-field-error");
    expect(hint.getAttribute("role")).toBe("alert");
    expect(hint.textContent).toContain("说点什么");

    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    expect(screen.queryByTestId("feedback-field-error")).toBeNull();
  });

  test("防重复提交：提交进行中连点发送只产生一个新版本", async () => {
    const orig = SkinOrchestrator.prototype.applyFeedbackSmart;
    const spy = vi.spyOn(SkinOrchestrator.prototype, "applyFeedbackSmart");
    spy.mockImplementation(async function (this: SkinOrchestrator, id: string, text: string) {
      await new Promise((r) => setTimeout(r, 60)); // 模拟 LLM/慢提交窗口
      return orig.call(this, id, text);
    });

    render(<App />);
    const before = versionCount();
    const input = screen.getByTestId("feedback-input");
    const send = screen.getByRole("button", { name: "发送" });

    fireEvent.change(input, { target: { value: "候选词字太小" } });
    // 同一事件批内连点两次（ref 同步守卫应挡住第二次）
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => {
      expect(versionCount()).toBe(before + 1); // 只 fork 一个
    });
    expect((input as HTMLInputElement).value).toBe(""); // 成功后清空
  });

  test("提交失败：显示可操作错误，输入保留；重试成功后错误消失并产生新版本", async () => {
    const orig = SkinOrchestrator.prototype.applyFeedbackSmart;
    const spy = vi.spyOn(SkinOrchestrator.prototype, "applyFeedbackSmart");
    spy.mockRejectedValueOnce(new Error("boom"));

    const user = userEvent.setup();
    render(<App />);
    const before = versionCount();
    const input = screen.getByTestId("feedback-input");

    await user.type(input, "颜色太深");
    await user.click(screen.getByRole("button", { name: "发送" }));

    const err = await screen.findByTestId("feedback-field-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("重试");
    expect((input as HTMLInputElement).value).toBe("颜色太深"); // 输入保留
    expect(versionCount()).toBe(before); // 失败不产生半成品版本

    // 重试：恢复真实实现后再发送 → 成功
    spy.mockImplementation(async function (this: SkinOrchestrator, id: string, text: string) {
      return orig.call(this, id, text);
    });
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => {
      expect(versionCount()).toBe(before + 1);
    });
    expect(screen.queryByTestId("feedback-field-error")).toBeNull();
  });
});
