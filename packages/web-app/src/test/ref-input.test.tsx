/**
 * FR-INPUT-1（参考素材）+ FR-INPUT-4（语音输入）前端测试。
 *
 * jsdom 无真实 canvas/video/SpeechRecognition，因此：
 * - 关键帧选择的直方图逻辑不在此测（属浏览器集成）；
 * - 重点测 UI 接线：上传入口存在且限定 image/video、不支持的类型给提示、
 *   语音不支持时按钮禁用（AC3 优雅退回）、mock SpeechRecognition 时转写写入输入框（AC1/AC2）。
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "../App.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("FR-INPUT-1 参考素材采集", () => {
  test("输入区提供参考图/视频上传入口，accept 限定 image/video", () => {
    render(<App />);
    const btn = screen.getByTestId("ref-upload-btn");
    expect(btn).toBeTruthy();
    const input = screen.getByTestId("ref-file-input") as HTMLInputElement;
    expect(input.accept).toBe("image/*,video/*");
    expect(input.multiple).toBe(true);
  });

  test("不支持的文件类型 → 明确报错提示（不静默）", async () => {
    render(<App />);
    const input = screen.getByTestId("ref-file-input") as HTMLInputElement;
    const bad = new File(["x"], "note.txt", { type: "text/plain" });
    // user.upload 会按 accept 过滤掉不匹配的文件，这里直接触发 change 模拟绕过系统选择器的场景
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => {
      expect(screen.getByTestId("ref-error").textContent).toMatch(/不支持的文件类型/);
    });
  });
});

describe("FR-INPUT-4 语音输入", () => {
  test("浏览器不支持 SpeechRecognition → 麦克风按钮禁用（AC3 优雅退回文字输入）", () => {
    render(<App />);
    const ideaMic = screen.getByTestId("mic-idea-btn") as HTMLButtonElement;
    const fbMic = screen.getByTestId("mic-feedback-btn") as HTMLButtonElement;
    expect(ideaMic.disabled).toBe(true);
    expect(fbMic.disabled).toBe(true);
  });

  test("mock SpeechRecognition：转写实时写入想法框，提交前可编辑（AC1/AC2）", async () => {
    // 最小 SpeechRecognition mock：start 后由测试触发 onresult
    let instance: {
      onresult: ((e: unknown) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    } | null = null;
    class FakeRec {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        instance = this;
      }
      stop() {
        this.onend?.();
      }
    }
    vi.stubGlobal("SpeechRecognition", FakeRec);

    const user = userEvent.setup();
    render(<App />);
    const mic = screen.getByTestId("mic-idea-btn") as HTMLButtonElement;
    expect(mic.disabled).toBe(false);

    await user.click(mic);
    expect(instance).not.toBeNull();

    // 模拟一段中文转写（final + interim）
    instance!.onresult?.({
      resultIndex: 0,
      results: [
        { 0: { transcript: "清冷极简" }, isFinal: true },
        { 0: { transcript: "水墨" }, isFinal: false },
      ],
    });
    const idea = screen.getByTestId("idea-input") as HTMLInputElement;
    await waitFor(() => expect(idea.value).toBe("清冷极简水墨"));

    // 停止后可继续编辑（AC1 提交前可修改）
    await user.click(mic);
    await user.type(idea, "留白");
    expect(idea.value).toBe("清冷极简水墨留白");
  });

  test("语音权限被拒 → 显示明确错误提示（AC3 不静默失败）", async () => {
    let instance: { onerror: ((e: { error: string }) => void) | null } | null = null;
    class FakeRec {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        instance = this;
      }
      stop() {}
    }
    vi.stubGlobal("SpeechRecognition", FakeRec);

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("mic-idea-btn"));
    instance!.onerror?.({ error: "not-allowed" });
    await waitFor(() => {
      expect(screen.getByTestId("mic-error").textContent).toMatch(/麦克风权限被拒绝/);
    });
  });
});
