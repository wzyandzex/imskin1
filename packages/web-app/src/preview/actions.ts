/**
 * 按键动作模型 —— 虚拟键盘上的键与物理键盘事件都归一成 KeyAction，交给 dispatch 施加到
 * InputSession 上。UI 层只产生动作、渲染 view()，输入逻辑全在 session（可单测）。
 */

import type { InputSession, InputMode } from "@imskin/pinyin-engine";

/** 面板种类：拼音键盘 / 符号面板 / 数字面板 / 表情面板（后三者为 UI 层状态，与 session 的拼音模式正交）。 */
export type PanelKind = "pinyin" | "symbol" | "number" | "emoji";

export type KeyAction =
  | { type: "input"; value: string }
  | { type: "backspace" }
  | { type: "space" }
  | { type: "enter" }
  | { type: "select"; index: number }
  | { type: "mode"; value: InputMode }
  | { type: "literal"; value: string }
  | { type: "panel"; value: PanelKind };

/**
 * 把动作施加到 session。返回 false 表示该动作是 UI 层的（如切面板），session 不处理，
 * 由调用方（PreviewRuntime）自行消化；返回 true 表示已作用于 session。
 */
export function dispatch(session: InputSession, action: KeyAction): boolean {
  switch (action.type) {
    case "input":
      session.input(action.value);
      return true;
    case "backspace":
      session.backspace();
      return true;
    case "space":
      session.space();
      return true;
    case "enter":
      if (session.view().composingActive) session.commitRaw();
      else session.insertText("\n");
      return true;
    case "select":
      session.selectCandidate(action.index);
      return true;
    case "mode":
      session.switchMode(action.value);
      return true;
    case "literal":
      session.insertText(action.value);
      return true;
    case "panel":
      return false; // UI 层状态，session 不处理
  }
}
