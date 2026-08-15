import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PreviewRuntime } from "../preview/PreviewRuntime.tsx";
import { App } from "../App.tsx";
import { coolMinimal } from "@imskin/skin-gen";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("PRE-001 预览接入 outlet（平台 PreviewProfile）", () => {
  test("默认 outlet=sogou_pc：徽标 + 搜狗特征状态项（全/半、键盘），无百度特征项", () => {
    render(<PreviewRuntime skin={coolMinimal} />);
    expect(screen.getByTestId("outlet-badge").textContent).toBe("搜狗 PC");
    const chrome = screen.getByTestId("platform-chrome");
    expect(within(chrome).getByText("全/半")).toBeTruthy();
    expect(within(chrome).getByText("键盘")).toBeTruthy();
    expect(within(chrome).queryByText("五笔")).toBeNull();
    expect(within(chrome).queryByText("按键自定义")).toBeNull();
  });

  test("outlet=baidu_pc：徽标切换 + 百度特征状态项（符、五笔），搜狗特征项消失", () => {
    render(<PreviewRuntime skin={coolMinimal} outlet="baidu_pc" />);
    expect(screen.getByTestId("outlet-badge").textContent).toBe("百度 PC");
    const chrome = screen.getByTestId("platform-chrome");
    expect(within(chrome).getByText("五笔")).toBeTruthy();
    expect(within(chrome).getByText("符")).toBeTruthy();
    expect(within(chrome).queryByText("全/半")).toBeNull();
  });

  test("outlet=baidu_android：Android 徽标 + 模拟项标注（诚实降级可见）", () => {
    render(<PreviewRuntime skin={coolMinimal} outlet="baidu_android" device="mobile" initialMode="t9" />);
    expect(screen.getByTestId("outlet-badge").textContent).toBe("百度 Android");
    const sim = screen.getByTestId("platform-sim");
    expect(sim.textContent).toContain("模拟项");
    expect(sim.getAttribute("title")).toContain("真机");
  });

  test("平台差异不破坏输入：带状态条仍可打字上屏", async () => {
    const user = userEvent.setup();
    render(<PreviewRuntime skin={coolMinimal} outlet="baidu_pc" />);
    const stage = screen.getByTestId("preview-stage");
    stage.focus();
    await user.keyboard("ni");
    const chip = within(screen.getByTestId("candidate-bar")).getByText("你").closest("button")!;
    await user.click(chip);
    expect(screen.getByTestId("committed").textContent).toContain("你");
  });
});

describe("PRE-001 工作台联动：平台×设备切换驱动 outlet", () => {
  test("切厂商/设备标签 → 预览徽标随之变为四个出口", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId("outlet-badge").textContent).toBe("搜狗 PC");

    await user.click(screen.getByRole("tab", { name: "百度" }));
    expect(screen.getByTestId("outlet-badge").textContent).toBe("百度 PC");

    await user.click(screen.getByRole("tab", { name: "手机" }));
    expect(screen.getByTestId("outlet-badge").textContent).toBe("百度 Android");

    await user.click(screen.getByRole("tab", { name: "搜狗" }));
    expect(screen.getByTestId("outlet-badge").textContent).toBe("搜狗 Android");
  });
});
