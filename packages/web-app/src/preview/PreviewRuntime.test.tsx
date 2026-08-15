import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PreviewRuntime } from "./PreviewRuntime.tsx";
import { coolMinimal, type SkinManifest } from "@imskin/skin-gen";

afterEach(cleanup);

function committed(): string {
  return screen.getByTestId("committed").textContent ?? "";
}

async function focusStage() {
  const stage = screen.getByTestId("preview-stage");
  stage.focus();
  return stage;
}

/** 以 pointer 类型派发一个带 clientY 的 MouseEvent（绕过 jsdom PointerEvent 不透传 clientY 的限制）。 */
function pointer(el: HTMLElement, type: string, clientY: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(ev, "pointerId", { value: 1, configurable: true });
  fireEvent(el, ev);
}

describe("PreviewRuntime 真实交互", () => {
  test("物理键盘打 nihao + 空格 → 落地文本框出现「你好」", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    await focusStage();

    await user.keyboard("nihao");
    // 候选栏首选应为「你好」
    expect(within(screen.getByTestId("candidate-bar")).getByText("你好")).toBeTruthy();
    // 拼音串展示
    expect(screen.getByTestId("composing").textContent).toContain("ni");

    await user.keyboard(" "); // 空格上屏首选
    expect(committed()).toBe("你好");
  });

  test("数字键选词：ni 后按 2 选「呢」", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    await focusStage();

    await user.keyboard("ni");
    await user.keyboard("2"); // 选第二个候选
    expect(committed()).toBe("呢");
  });

  test("边打边选：nihaoma → 选「你好」后缓冲剩 ma，可继续打「吗」", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    await focusStage();

    await user.keyboard("nihaoma");
    // 首选你好，按 1 选它
    await user.keyboard("1");
    expect(committed()).toBe("你好");
    // 现在应还在组合 ma
    expect(screen.getByTestId("composing").textContent).toContain("ma");
    const maChip = within(screen.getByTestId("candidate-bar")).getByText("吗").closest("button")!;
    await user.click(maChip);
    expect(committed()).toBe("你好吗");
  });

  test("点击虚拟键盘按键也能输入（shurufa → 输入法）", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    const kb = screen.getByTestId("vkeyboard");
    for (const ch of "shurufa") {
      await user.click(kb.querySelector(`[data-key="${ch}"]`) as HTMLElement);
    }
    const chip = within(screen.getByTestId("candidate-bar")).getByText("输入法").closest("button")!;
    await user.click(chip);
    expect(committed()).toBe("输入法");
  });

  test("切换九宫格：点「九」后用数字键盘打「你好」", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    const kb = screen.getByTestId("vkeyboard");

    await user.click(within(kb).getByRole("button", { name: "九" }));
    // 九宫格布局出现（键上有 abc 字母组）
    expect(within(screen.getByTestId("vkeyboard")).getByText("abc")).toBeTruthy();

    for (const d of "64426") {
      await user.click(within(screen.getByTestId("vkeyboard")).getByRole("button", { name: new RegExp(`^${d}`) }));
    }
    const chip = within(screen.getByTestId("candidate-bar")).getByText("你好").closest("button")!;
    await user.click(chip);
    expect(committed()).toBe("你好");
  });

  test("退格与 Esc：删缓冲、清组合", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    await focusStage();

    await user.keyboard("nihao");
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("composing").textContent).toContain("ni"); // 还在组合
    await user.keyboard("{Escape}");
    // 组合清空后再空格 → 输入空格字符
    await user.keyboard(" ");
    expect(committed()).toBe(" ");
  });

  test("手机形态：竖屏外壳内点击键盘可输入，按键音在无 Web Audio 环境安全 no-op", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} device="mobile" soundEnabled />);
    expect(screen.getByTestId("preview-stage").className).toContain("mobile");
    const kb = screen.getByTestId("vkeyboard");
    for (const ch of "wo") {
      await user.click(kb.querySelector(`[data-key="${ch}"]`) as HTMLElement);
    }
    const chip = within(screen.getByTestId("candidate-bar")).getByText("我").closest("button")!;
    await user.click(chip);
    expect(committed()).toBe("我");
  });

  test("移动端默认九宫格 T9：手机形态初始即显示九宫格（数字键 + abc 字母组）", async () => {
    render(<PreviewRuntime skin={coolMinimal} device="mobile" initialMode="t9" />);
    const kb = screen.getByTestId("vkeyboard");
    // 九宫格特征：数字键 2/5/8 与字母组 abc/def/ghi 已在初始布局
    expect(within(kb).getByText("abc")).toBeTruthy();
    expect(within(kb).getByText("def")).toBeTruthy();
    expect(within(kb).getByText("ghi")).toBeTruthy();
    // 26 键特征不应出现（如 q 字母键）
    expect(kb.querySelector('[data-key="q"]')).toBeNull();
  });

  test("手势：在顶行 q 键上滑 → 输入次字符数字 1（§4.8）", () => {
    render(<PreviewRuntime skin={coolMinimal} />);
    const kb = screen.getByTestId("vkeyboard");
    const q = kb.querySelector('[data-key="q"]') as HTMLElement;
    expect(q).toBeTruthy();
    // jsdom 的 PointerEvent 不透传 clientY，改用 MouseEvent（jsdom 支持 clientY）并以 pointer 类型派发
    pointer(q, "pointerdown", 120);
    pointer(q, "pointerup", 78); // 上滑 42 ≥ 阈值
    expect(committed()).toBe("1");
  });

  test("手势：顶行键普通点按（无上滑）仍输入字母，可组词", () => {
    render(<PreviewRuntime skin={coolMinimal} />);
    const kb = screen.getByTestId("vkeyboard");
    for (const ch of "wo") {
      const key = kb.querySelector(`[data-key="${ch}"]`) as HTMLElement;
      pointer(key, "pointerdown", 100);
      pointer(key, "pointerup", 100); // 原位抬起，无位移
    }
    expect(within(screen.getByTestId("candidate-bar")).getByText("我")).toBeTruthy();
  });

  test("符号面板（UX-001）：点「符」切面板 → 点「！」字面插入 → 「返回」回到拼音键盘可继续打字", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    const kb = screen.getByTestId("vkeyboard");

    await user.click(within(kb).getByRole("button", { name: "符" }));
    // 面板特征：符号键出现、字母键消失
    expect(within(kb).getByText("！")).toBeTruthy();
    expect(kb.querySelector('[data-key="q"]')).toBeNull();

    await user.click(within(kb).getByRole("button", { name: "！" }));
    expect(committed()).toBe("！");

    await user.click(within(kb).getByRole("button", { name: "返回" }));
    expect(kb.querySelector('[data-key="q"]')).toBeTruthy();

    // 返回后拼音输入仍可用（回归：面板不破坏会话）
    for (const ch of "wo") {
      await user.click(kb.querySelector(`[data-key="${ch}"]`) as HTMLElement);
    }
    const chip = within(screen.getByTestId("candidate-bar")).getByText("我").closest("button")!;
    await user.click(chip);
    expect(committed()).toBe("！我");
  });

  test("数字面板（UX-001）：点「123」→ 点「7」插入 → 符号面板内可互切到数字面板", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} />);
    const kb = screen.getByTestId("vkeyboard");

    await user.click(within(kb).getByRole("button", { name: "123" }));
    expect(kb.querySelector('[data-key="q"]')).toBeNull();

    await user.click(within(kb).getByRole("button", { name: /^7$/ }));
    expect(committed()).toBe("7");

    // 符号面板底行也有「123」，面板间互切
    await user.click(within(kb).getByRole("button", { name: "符" }));
    await user.click(within(kb).getByRole("button", { name: "123" }));
    await user.click(within(kb).getByRole("button", { name: /^0$/ }));
    expect(committed()).toBe("70");

    await user.click(within(kb).getByRole("button", { name: "返回" }));
    expect(kb.querySelector('[data-key="q"]')).toBeTruthy();
  });

  test("T9 下符号面板可用（UX-001）：九宫格点「符」→ 插入「，」→ 返回仍是九宫格", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} device="mobile" initialMode="t9" />);
    const kb = screen.getByTestId("vkeyboard");
    expect(within(kb).getByText("abc")).toBeTruthy();

    await user.click(within(kb).getByRole("button", { name: "符" }));
    await user.click(within(kb).getByRole("button", { name: "，" }));
    expect(committed()).toBe("，");

    await user.click(within(kb).getByRole("button", { name: "返回" }));
    // 回到九宫格（字母组特征仍在）
    expect(within(kb).getByText("abc")).toBeTruthy();
    expect(within(kb).getByText("wxyz")).toBeTruthy();
  });

  test("位图皮肤：键盘与候选栏 image 背景各渲染九宫格 Canvas 层，且不影响输入（§4.7）", async () => {
    const user = userEvent.setup();
    const imgFill = { type: "image" as const, src: "data:image/png;base64,iVBORw0KGgo=", slice: { top: 8, right: 8, bottom: 8, left: 8 } };
    const imgSkin: SkinManifest = {
      ...coolMinimal,
      keyboard: { ...coolMinimal.keyboard, background: imgFill },
      candidateBar: { ...coolMinimal.candidateBar, background: imgFill },
    };
    render(<PreviewRuntime skin={imgSkin} />);
    await focusStage();
    await user.keyboard("ni"); // 让候选栏进入组合态（渲染候选栏内容 + 其位图层）
    expect(screen.getAllByTestId("nine-slice").length).toBe(2); // 键盘 + 候选栏各一
    expect(within(screen.getByTestId("candidate-bar")).getByText("你")).toBeTruthy();
  });
});
