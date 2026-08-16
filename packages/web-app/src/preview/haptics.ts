/**
 * 触感/振动（MOB-002，FR-PREVIEW-6 AC7）—— navigator.vibrate 尽力还原。
 *
 * 诚实边界：浏览器振动远弱于真机输入法（且 iOS Safari 完全不支持）。
 * 支持时 UI 标注"浏览器模拟（真机更强）"，不支持时明确提示，不假装等价。
 */

export function vibrateSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** 按键触感（默认 8ms 轻震）。不支持/失败一律安全 no-op，绝不让输入路径抛错。 */
export function vibrateKeytap(patternMs = 8): boolean {
  if (!vibrateSupported()) return false;
  try {
    return navigator.vibrate(patternMs);
  } catch {
    return false;
  }
}
