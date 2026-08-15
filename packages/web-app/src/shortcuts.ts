/**
 * 键盘快捷键注册表（可扩展）。
 *
 * 设计目标（对齐应用设置中心）：动作 = 数据，不是写死的代码。
 * 以后要加新快捷键，只需往 SHORTCUTS 里加一条 { id, label, hint, defaultCombo }，
 * 设置页"键盘快捷键"自动列出它、tooltip 自动取它的按键、全局监听自动生效。
 *
 * combo 用规范化字符串：修饰键按 Ctrl+Alt+Shift+Meta 排序，后接主键（大写），
 * 如 "Ctrl+," / "Ctrl+J" / "Ctrl+Shift+O"。空串 "" 表示未分配。
 */

export interface ShortcutAction {
  /** 动作唯一 id（也用作持久化的 key）。 */
  id: string;
  /** 动作名（列表主标题）。 */
  label: string;
  /** 灰色说明小字（副标题）。 */
  hint: string;
  /** 默认按键。 */
  defaultCombo: string;
}

/** 动作注册表：以后扩展就往这里加。 */
export const SHORTCUTS: ShortcutAction[] = [
  { id: "toggle-chat", label: "切换侧边聊天", hint: "显示或隐藏右侧对话栏", defaultCombo: "Ctrl+J" },
  { id: "open-settings", label: "打开设置", hint: "打开应用设置中心", defaultCombo: "Ctrl+," },
  { id: "switch-model", label: "切换模型", hint: "打开模型与推理强度切换器", defaultCombo: "Ctrl+Shift+M" },
  { id: "reset-project", label: "重置项目", hint: "清空所有版本，回到初始项目", defaultCombo: "" }, // 危险操作，默认不绑键
];

const STORAGE_KEY = "imskin.shortcuts.v1";

/** 把一次键盘事件规范化为 combo 字符串（修饰键排序 + 主键大写）。 */
export function normalizeCombo(e: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const key = e.key;
  // 只按修饰键本身不算一次完整按键
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Meta");
  let main = key;
  if (main === " ") main = "Space";
  else if (main.length === 1) main = main.toUpperCase();
  else main = main[0].toUpperCase() + main.slice(1); // Enter/Tab/ArrowUp…
  return [...mods, main].join("+");
}

/** 当前生效的按键映射（actionId -> combo）。默认 + 用户覆盖。 */
export function loadCombos(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of SHORTCUTS) map[a.id] = a.defaultCombo;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, string>;
      for (const a of SHORTCUTS) if (typeof saved[a.id] === "string") map[a.id] = saved[a.id];
    }
  } catch {
    /* 损坏则用默认 */
  }
  return map;
}

export function saveCombos(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** 反查：某个 combo 当前绑在哪个动作上（用于冲突检测）。 */
export function actionForCombo(map: Record<string, string>, combo: string): string | null {
  if (!combo) return null;
  for (const [id, c] of Object.entries(map)) if (c === combo) return id;
  return null;
}

/** 事件当前是否命中某动作。 */
export function matches(map: Record<string, string>, actionId: string, e: KeyboardEvent): boolean {
  const combo = map[actionId];
  if (!combo) return false;
  return normalizeCombo(e) === combo;
}

/** 焦点在可输入元素里时不触发全局快捷键。 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}
