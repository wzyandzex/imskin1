import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

/** 拦截浏览器下载（避免 jsdom NotImplemented）。 */
function mockDownloads() {
  const clicks: string[] = [];
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as never;
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicks.push(this.download);
  };
  return {
    clicks,
    restore() {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    },
  };
}

describe("JOB-001 分出口导出隔离（Web）", () => {
  test("单出口构建失败：只报该出口错误，其余三口照常下载", async () => {
    const dl = mockDownloads();
    const spy = vi.spyOn(SkinOrchestrator.prototype, "exportSogouMobile").mockImplementation(function (this: SkinOrchestrator) {
      throw new Error("sogou android layout crash");
    });
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByTestId("confirm-version")); // UX-003 门禁
      await user.click(screen.getByRole("button", { name: "导出全部" }));

      // 其余三口成功下载；失败口（sogou-mobile）不出现
      expect(dl.clicks.length).toBe(3);
      expect(dl.clicks.some((f) => f.endsWith("-sogou-pc.ssf"))).toBe(true);
      expect(dl.clicks.some((f) => f.endsWith("-baidu-pc.bps"))).toBe(true);
      expect(dl.clicks.some((f) => f.endsWith("-baidu-mobile.bds"))).toBe(true);
      expect(dl.clicks.some((f) => f.endsWith("-sogou-mobile.ssf"))).toBe(false);

      // 失败出口以 role=alert 展示，指明 outlet 与可重试提示
      const err = screen.getByTestId("export-outlet-errors");
      expect(err.getAttribute("role")).toBe("alert");
      expect(err.textContent).toContain("sogou_android");
      expect(err.textContent).toContain("重试");

      // 恢复后重试 → 错误清除，四口齐全
      spy.mockRestore();
      await user.click(screen.getByRole("button", { name: "导出全部" }));
      expect(screen.queryByTestId("export-outlet-errors")).toBeNull();
      expect(dl.clicks.length).toBe(7); // 3 + 4
    } finally {
      dl.restore();
    }
  });
});
