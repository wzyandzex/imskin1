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

describe("FR-PREVIEW-7 多机型 DPI 档位预览", () => {
  test("手机形态提供 标清/高清/超清 三档切换", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "手机" }));
    expect(screen.getByRole("tab", { name: "标清" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "高清" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "超清" })).toBeTruthy();
  });

  test("切换档位 → 外壳标注当前模拟的 DPI（不混淆，AC2）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "手机" }));
    // 默认高清
    expect(screen.getByTestId("dpi-badge").textContent).toContain("320");
    await user.click(screen.getByRole("tab", { name: "超清" }));
    expect(screen.getByTestId("dpi-badge").textContent).toContain("480");
    await user.click(screen.getByRole("tab", { name: "标清" }));
    expect(screen.getByTestId("dpi-badge").textContent).toContain("160");
  });

  test("切换档位 → 缩放层应用对应 scale（高密度放大暴露发虚）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "手机" }));
    const frame = screen.getByTestId("mobile-frame");
    const scaleOf = () => frame.querySelector(".dpi-scale")!.getAttribute("style") ?? "";
    expect(scaleOf()).toContain("scale(1)");
    await user.click(screen.getByRole("tab", { name: "超清" }));
    expect(scaleOf()).toContain("scale(1.12)");
    await user.click(screen.getByRole("tab", { name: "标清" }));
    expect(scaleOf()).toContain("scale(0.85)");
  });

  test("DPI 档位只在手机形态出现（PC 形态无）", async () => {
    render(<App />);
    // 默认 PC
    expect(screen.queryByRole("button", { name: "标清" })).toBeNull();
    expect(screen.queryByTestId("dpi-badge")).toBeNull();
  });
});
