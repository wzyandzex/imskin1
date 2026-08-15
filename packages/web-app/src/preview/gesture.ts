/**
 * 按键手势判定（纯函数，可严格单测）——§4.8 移动手势：上滑 / 长按输入"次字符"。
 *
 * 很多真实皮肤在按键上提供次字符（如 26 键顶行 q…p 上滑输入数字 1…0）。判定规则：
 * - 无次字符 → 永远走主动作（普通点按输入该键）。
 * - 长按弹出过 → 松手输入次字符。
 * - 手指上滑超过阈值 → 输入次字符。
 * - 否则 → 主动作。
 */
export function resolveKeyGesture(
  startY: number | null,
  endY: number | null,
  popupActive: boolean,
  hasSecondary: boolean,
  threshold = 18,
): boolean {
  if (!hasSecondary) return false;
  if (popupActive) return true;
  if (startY !== null && endY !== null && startY - endY >= threshold) return true;
  return false;
}
