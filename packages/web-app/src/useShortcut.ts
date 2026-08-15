/**
 * 快捷键 React 绑定。
 *
 * - useShortcutCombos：全局按键映射（默认 + 用户覆盖），改键后持久化。
 * - useGlobalShortcut：把"事件 → 动作"的监听挂到 window；输入框内不触发。
 */

import { useCallback, useEffect, useState } from "react";
import { isTypingTarget, loadCombos, normalizeCombo, saveCombos } from "./shortcuts.ts";

export function useShortcutCombos() {
  const [combos, setCombos] = useState<Record<string, string>>(() => loadCombos());
  const setCombo = useCallback((id: string, combo: string) => {
    setCombos((m) => {
      const next = { ...m, [id]: combo };
      saveCombos(next);
      return next;
    });
  }, []);
  return { combos, setCombo };
}

/**
 * 全局快捷键监听。handlers: actionId -> 回调。
 * 依赖 combos（改键后立即生效）与 handlers 引用。
 */
export function useGlobalShortcut(
  combos: Record<string, string>,
  handlers: Record<string, () => void>,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const combo = normalizeCombo(e);
      if (!combo) return;
      for (const [id, c] of Object.entries(combos)) {
        if (c && c === combo && handlers[id]) {
          e.preventDefault();
          handlers[id]!();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combos, handlers]);
}
