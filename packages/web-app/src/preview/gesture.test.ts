import { describe, test, expect } from "vitest";
import { resolveKeyGesture } from "./gesture.ts";

describe("resolveKeyGesture", () => {
  test("无次字符 → 永远主动作", () => {
    expect(resolveKeyGesture(100, 40, false, false)).toBe(false);
    expect(resolveKeyGesture(100, 40, true, false)).toBe(false);
  });
  test("上滑超过阈值 → 次字符", () => {
    expect(resolveKeyGesture(100, 80, false, true)).toBe(true); // 差 20 ≥ 18
  });
  test("上滑不足阈值 → 主动作", () => {
    expect(resolveKeyGesture(100, 90, false, true)).toBe(false); // 差 10
  });
  test("下滑 → 主动作", () => {
    expect(resolveKeyGesture(100, 130, false, true)).toBe(false);
  });
  test("长按弹出过 → 次字符（即便没上滑）", () => {
    expect(resolveKeyGesture(100, 100, true, true)).toBe(true);
  });
  test("坐标缺失且无长按 → 主动作", () => {
    expect(resolveKeyGesture(null, null, false, true)).toBe(false);
  });
});
