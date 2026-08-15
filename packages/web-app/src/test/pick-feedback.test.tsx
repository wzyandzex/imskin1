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

/** UX-002：点选覆盖层仅在「标注模式」渲染——进入标注模式是点选区交互的前置。 */
async function enterAnnotate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("pick-mode-toggle"));
}

describe("UX-002 试打/标注模式分离", () => {
  test("默认试打模式：无点选覆盖层（零拦截），点击键盘/候选即真实输入", async () => {
    const user = userEvent.setup();
    render(<App />);
    // 覆盖层不存在
    expect(screen.queryByTestId("pick-candidate")).toBeNull();
    expect(screen.queryByTestId("pick-key")).toBeNull();
    expect(screen.queryByTestId("pick-mode-hint")).toBeNull();

    // 点击虚拟键盘 + 候选词 = 真实输入（若覆盖层存在，这些点击会被拦截选元素）
    const kb = screen.getByTestId("vkeyboard");
    await user.click(kb.querySelector('[data-key="w"]') as HTMLElement);
    await user.click(kb.querySelector('[data-key="o"]') as HTMLElement);
    const chip = within(screen.getByTestId("candidate-bar")).getByText("我").closest("button")!;
    await user.click(chip);
    expect(screen.getByTestId("committed").textContent).toContain("我");
  });

  test("开启标注模式：覆盖层出现（不依赖右键/Alt，移动端可用）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterAnnotate(user);
    for (const k of ["candidate", "candidate-selected", "composing", "key", "key-special", "keyboard-bg", "candidate-bg"]) {
      expect(screen.getByTestId(`pick-${k}`)).toBeTruthy();
    }
    expect(screen.getByTestId("pick-mode-hint")).toBeTruthy();
  });

  test("退出标注模式：覆盖层消失，恢复真实试打", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterAnnotate(user);
    expect(screen.getByTestId("pick-candidate")).toBeTruthy();
    await user.click(screen.getByTestId("pick-mode-toggle")); // 再点一次退出
    expect(screen.queryByTestId("pick-candidate")).toBeNull();
    const kb = screen.getByTestId("vkeyboard");
    await user.click(kb.querySelector('[data-key="w"]') as HTMLElement);
    await user.click(kb.querySelector('[data-key="o"]') as HTMLElement);
    const chip = within(screen.getByTestId("candidate-bar")).getByText("我").closest("button")!;
    await user.click(chip);
    expect(screen.getByTestId("committed").textContent).toContain("我");
  });
});

describe("FR-FEEDBACK-5 细粒度点选反馈（标注模式下）", () => {
  test("点选「候选词」→ 出现已点选提示（只改这一块）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterAnnotate(user);
    await user.click(screen.getByTestId("pick-candidate"));
    const hint = screen.getByTestId("picked-hint");
    expect(hint.textContent).toContain("候选词");
    expect(hint.textContent).toContain("只改这一块");
  });

  test("点选「功能键」→ 提示指向功能键；再点一次取消", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterAnnotate(user);
    await user.click(screen.getByTestId("pick-key-special"));
    expect(screen.getByTestId("picked-hint").textContent).toContain("功能键");
    await user.click(screen.getByTestId("pick-key-special"));
    expect(screen.queryByTestId("picked-hint")).toBeNull();
  });

  test("点选「字母键」+ 反馈「字太小」→ 定向改按键字号，产生新版本", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterAnnotate(user);
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
    await enterAnnotate(user);
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
    await enterAnnotate(user);
    await user.click(screen.getByTestId("pick-candidate"));
    expect((screen.getByTestId("feedback-input") as HTMLInputElement).placeholder).toContain("候选词");
  });
});
