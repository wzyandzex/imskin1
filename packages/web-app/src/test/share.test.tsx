import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent, act } from "@testing-library/react";
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

/** 拦截下载，返回 {filename -> text}（jsdom 无 Blob.text，用 FileReader 读取）。 */
function captureDownloads() {
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const files = new Map<string, Blob>();
  URL.createObjectURL = ((b: Blob) => {
    (URL as unknown as { __last: Blob }).__last = b;
    return "blob:mock";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as never;
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    files.set(this.download, (URL as unknown as { __last: Blob }).__last);
  };
  const readBlob = (b: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsText(b);
    });
  return {
    files,
    async textOf(name: string) {
      const b = files.get(name);
      return b ? await readBlob(b) : null;
    },
    restore() {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    },
  };
}

describe("FR-SHARE 分享与导回", () => {
  test("导出项目 → 得到自包含 .imskin.json，内含版本树与当前版本", async () => {
    const cap = captureDownloads();
    try {
      const user = userEvent.setup();
      render(<App />);
      // 先加一个反馈，让版本树有 2 个版本
      await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
      await user.click(screen.getByRole("button", { name: "发送" }));
      await user.click(screen.getByRole("button", { name: "导出项目" }));
      const name = [...cap.files.keys()].find((f) => f.endsWith(".imskin.json"));
      expect(name).toBeTruthy();
      const text = await cap.textOf(name!);
      const obj = JSON.parse(text!);
      expect(obj.format).toBe("imskin-project");
      expect(obj.version).toBe(1);
      expect(Array.isArray(obj.store.versions)).toBe(true);
      expect(obj.store.versions.length).toBe(2);
      expect(obj.currentId).toBeTruthy();
    } finally {
      cap.restore();
    }
  });

  test("导出→导入 round-trip：导入刚导出的项目文件，版本数一致", async () => {
    const cap = captureDownloads();
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.type(screen.getByTestId("feedback-input"), "候选词字太小");
      await user.click(screen.getByRole("button", { name: "发送" }));
      await user.click(screen.getByRole("button", { name: "导出项目" }));
      const name = [...cap.files.keys()].find((f) => f.endsWith(".imskin.json"));
      const text = (await cap.textOf(name!))!;
      const exportedCount = within(screen.getByTestId("version-rail")).getAllByRole("button").length;

      // 同一实例内直接导入（等价于"另一台设备/另一会话收到该文件后导入"）
      const input = screen.getByTestId("import-file-input") as HTMLInputElement;
      const file = new File([text], "p.imskin.json", { type: "application/json" });
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
        await new Promise((r) => setTimeout(r, 30));
      });
      const rail = screen.getByTestId("version-rail");
      await within(rail).findAllByRole("button", undefined, { timeout: 2000 });
      // 导入后版本树与导出时一致（round-trip 不丢版本）
      expect(within(rail).getAllByRole("button").length).toBe(exportedCount);
      expect(screen.queryByTestId("import-error")).toBeNull();
    } finally {
      cap.restore();
    }
  });

  test("导入非法文件 → 明确报错，不静默改变现状", async () => {
    render(<App />);
    const rail = screen.getByTestId("version-rail");
    const before = within(rail).getAllByRole("button").length;
    const input = screen.getByTestId("import-file-input") as HTMLInputElement;
    const bad = new File(["{ not a project"], "bad.json", { type: "application/json" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByTestId("import-error").textContent).toContain("导入失败");
    expect(within(rail).getAllByRole("button").length).toBe(before);
  });
});
