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

describe("SEC-003 密钥与隐私", () => {
  test("设置页「接入模型」显示密钥存储边界提示（localStorage + 直连 + 导出不含 Key）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("settings-menu-btn"));
    await user.click(screen.getByTestId("menu-open-settings"));
    await user.click(screen.getByTestId("settings-cat-models"));

    const notice = screen.getByTestId("key-storage-notice");
    expect(notice.textContent).toContain("localStorage");
    expect(notice.textContent).toContain("直连");
    expect(notice.textContent).toContain("不包含任何模型配置与 Key");
  });

  test("项目文件导出不含密钥：即使配置了 apiKey，导出 JSON 中无 apiKey/Bearer 痕迹", async () => {
    // 预置一份带 Key 的模型配置（真实场景：用户填过 Key）
    localStorage.setItem("imskin:llm:v2", JSON.stringify({
      configs: [{
        id: "c1", label: "测试服务", baseUrl: "https://api.example.com/v1",
        apiKey: "sk-SECRET-KEY-123456", model: "test-model", enabled: true,
      }],
      activeId: "c1",
    }));

    // 拦截下载，捕获 Blob 内容
    let captured: Blob | null = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = ((b: Blob) => {
      captured = b;
      return "blob:mock";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as never;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* no-op */ };
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByTestId("version-rail").querySelector('[data-action="export-project"]') as HTMLElement);
      expect(captured).toBeTruthy();
      const blob = captured as unknown as Blob;
      const text = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsText(blob);
      });
      expect(text).not.toContain("apiKey");
      expect(text).not.toContain("sk-SECRET");
      expect(text).not.toContain("Bearer");
      // 项目文件确为版本树结构（含 store 快照），不含模型配置键
      expect(text).toContain("imskin-project");
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
