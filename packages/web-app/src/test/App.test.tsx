import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "../App.tsx";

/** 版本时间线里的"版本项"按钮（排除 导出项目/导入项目 等操作按钮）。 */
function versionButtons(rail: HTMLElement) {
  return within(rail).getAllByRole("button").filter((b) => b.classList.contains("version-item"));
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("工作台反馈主循环", () => {
  test("初始有一个根版本；一句反馈 fork 出新版本并回显分类", async () => {
    const user = userEvent.setup();
    render(<App />);

    const rail = screen.getByTestId("version-rail");
    expect(versionButtons(rail).length).toBe(1);

    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));

    // 版本树新增一个版本
    expect(versionButtons(rail).length).toBe(2);
    // 回显：识别为"具体参数"类
    expect(screen.getByTestId("feedback-echo").textContent).toContain("具体参数");
  });

  test("风格类反馈：'想再稳重一点' 被识别为整体风格", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "整体太活泼了，想再稳重一点");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(screen.getByTestId("feedback-echo").textContent).toContain("整体风格");
  });

  test("从设计意图生成新版本会加入时间线", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rail = screen.getByTestId("version-rail");
    const before = versionButtons(rail).length;
    // 新 A1 流程：输入想法 → 生成 →（追问则跳过）→ 确认生成
    await user.type(screen.getByTestId("idea-input"), "极简风格，主色天蓝 #5ab0f0，情绪清新明亮");
    await user.click(screen.getByRole("button", { name: "生成" }));
    if (screen.queryByTestId("clarify-card")) {
      await user.click(screen.getByRole("button", { name: "你看着办" }));
    }
    await user.click(screen.getByTestId("confirm-generate"));
    expect(versionButtons(rail).length).toBe(before + 1);
  });

  test("并排对比：反馈后开启对比，显示两个独立预览（改前 vs 改后）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await user.click(screen.getByRole("button", { name: "并排对比" }));
    expect(screen.getByTestId("compare-row")).toBeTruthy();
    expect(screen.getAllByTestId("preview-stage").length).toBe(2);
  });

  test("版本树分叉：从同一版本两次反馈 → 出现 ├/└ 连线", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rail = screen.getByTestId("version-rail");
    const rootLabel = within(rail).getByText("初始 · 清新薄荷");

    // 反馈1：从根 fork 出 v2
    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    // 回到根版本，再反馈 → fork 出 v3（与 v2 同父 → 分叉）
    await user.click(rootLabel.closest("button")!);
    await user.type(screen.getByTestId("feedback-input"), "想再稳重一点");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(versionButtons(rail).length).toBe(3);
    const treeText = Array.from(rail.querySelectorAll(".v-tree")).map((e) => e.textContent).join("");
    expect(treeText).toMatch(/[├└]/); // 出现分叉连线
  });

  test("持久化：重新挂载（模拟刷新）后版本树从 localStorage 恢复", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(versionButtons(screen.getByTestId("version-rail")).length).toBe(2);

    unmount();
    render(<App />); // 全新挂载 → 应从存档恢复而非新建
    expect(versionButtons(screen.getByTestId("version-rail")).length).toBe(2);
  });

  test("重置：清空存档并回到单一初始版本，且刷新后不复活旧版本（回归）", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(versionButtons(screen.getByTestId("version-rail")).length).toBe(2);
    await user.click(screen.getByRole("button", { name: "重置" }));
    expect(versionButtons(screen.getByTestId("version-rail")).length).toBe(1);

    // 重新挂载（模拟刷新）：应仍是全新的单一版本，而非旧树复活
    unmount();
    render(<App />);
    expect(versionButtons(screen.getByTestId("version-rail")).length).toBe(1);
  });

  test("导出按钮随平台×设备切换：搜狗→.ssf，百度→.bps/.bds", async () => {
    const user = userEvent.setup();
    render(<App />);
    // 默认 搜狗×PC
    expect(screen.getByRole("button", { name: /导出 \.ssf/ })).toBeTruthy();
    // 搜狗×手机 → 移动 .ssf
    await user.click(screen.getByRole("tab", { name: "手机" }));
    expect(screen.getByRole("button", { name: /导出 移动 \.ssf/ })).toBeTruthy();
    // 百度×手机 → 移动 .bds
    await user.click(screen.getByRole("tab", { name: "百度" }));
    expect(screen.getByRole("button", { name: /导出 移动 \.bds/ })).toBeTruthy();
    // 百度×PC → .bps
    await user.click(screen.getByRole("tab", { name: "PC" }));
    expect(screen.getByRole("button", { name: /导出 \.bps/ })).toBeTruthy();
  });

  test("「导出全部」按钮存在，可一键导出四出口（UX-003：需先确认版本）", async () => {
    // 模拟 URL.createObjectURL 与 a.click 下载，避免 jsdom 报 NotImplemented
    const orig = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const urls: string[] = [];
    URL.createObjectURL = ((b: Blob) => {
      urls.push(b.size + "");
      return "blob:mock";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as never;
    const clicks: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    try {
      const user = userEvent.setup();
      render(<App />);
      // UX-003：未确认时按钮禁用，点击不产生下载
      const gateBtn = screen.getByRole("button", { name: "导出全部" }) as HTMLButtonElement;
      expect(gateBtn.disabled).toBe(true);
      await user.click(gateBtn);
      expect(clicks.length).toBe(0);
      // 确认后导出放行
      await user.click(screen.getByTestId("confirm-version"));
      const btn = screen.getByRole("button", { name: "导出全部" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      await user.click(btn);
      // 四出口各下载一个文件
      expect(clicks.length).toBe(4);
      expect(clicks.some((f) => f.endsWith("-sogou-pc.ssf"))).toBeTruthy();
      expect(clicks.some((f) => f.endsWith("-sogou-mobile.ssf"))).toBeTruthy();
      expect(clicks.some((f) => f.endsWith("-baidu-pc.bps"))).toBeTruthy();
      expect(clicks.some((f) => f.endsWith("-baidu-mobile.bds"))).toBeTruthy();
    } finally {
      URL.createObjectURL = orig;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
