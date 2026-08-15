/**
 * 虚拟键盘 —— 按当前布局渲染按键，皮肤驱动外观，按下态套用皮肤 keyActive 样式。
 *
 * 手势（§4.8）：带次字符的键（如 26 键顶行 q…p 的数字）支持**上滑输入**与**长按弹出**。
 * 判定在 pointerup 用纯函数 resolveKeyGesture 决定走主动作还是次字符；pointerdown 时对该键
 * setPointerCapture，避免上滑移出键边界导致手势被 pointerleave 打断。
 */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { KeyboardStyle } from "@imskin/skin-gen";
import { fillToBackground, fontToCss, keyStyleToCss } from "../skin/fills.ts";
import { NineSliceCanvas } from "../skin/NineSliceCanvas.tsx";
import type { KeyCap } from "./layouts.ts";
import type { KeyAction } from "./actions.ts";
import { resolveKeyGesture } from "./gesture.ts";

interface Props {
  layout: KeyCap[][];
  style: KeyboardStyle;
  onAction: (action: KeyAction) => void;
  /** 元素级点选反馈（FR-FEEDBACK-5）：Alt+点击 或 右键 点选单个键。 */
  onPickElement?: (el: { label: string; token: string }) => void;
  pickedLabel?: string | null;
}

const LONG_PRESS_MS = 380;

export function VirtualKeyboard({ layout, style, onAction, onPickElement, pickedLabel }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const gesture = useRef<{ id: string; startY: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // 卸载时清掉未触发的长按定时器，避免它在组件消失后仍尝试更新状态（如切换皮肤/版本时）。
  useEffect(() => () => clearTimer(), []);

  const reset = () => {
    clearTimer();
    gesture.current = null;
    setActiveKey(null);
    setPopupKey(null);
  };

  // 背景：位图九宫格用 Canvas 层渲染（§4.7），其余（纯色/渐变）走 CSS。
  const imgFill = style.background.type === "image" ? style.background : null;
  const useNineSlice = imgFill !== null && imgFill.slice !== undefined;

  const boardStyle: CSSProperties = {
    background: useNineSlice ? "transparent" : fillToBackground(style.background),
    padding: style.padding,
    gap: style.gap,
    ...fontToCss(style.font),
  };

  const onDown = (cap: KeyCap, id: string, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setActiveKey(id);
    gesture.current = { id, startY: e.clientY };
    if (cap.secondary) timer.current = setTimeout(() => setPopupKey(id), LONG_PRESS_MS);
  };

  const onUp = (cap: KeyCap, id: string, e: PointerEvent<HTMLButtonElement>) => {
    clearTimer();
    const g = gesture.current;
    const startY = g && g.id === id ? g.startY : null;
    const useSecondary = resolveKeyGesture(startY, e.clientY, popupKey === id, !!cap.secondary);
    onAction(useSecondary && cap.secondary ? { type: "literal", value: cap.secondary } : cap.action);
    reset();
  };

  // 键盘背景点选（点键盘空白区选背景）
  const onBoardClick = (e: React.MouseEvent) => {
    if (!onPickElement) return;
    if ((e.target as HTMLElement).closest(".vk-key")) return; // 点在键上不算背景
    onPickElement({ label: "键盘背景", token: "键盘背景" });
  };

  return (
    <div className={`vkeyboard${pickedLabel === "键盘背景" ? " pick-target" : ""}`} style={boardStyle} data-testid="vkeyboard" onClick={onBoardClick}>
      {useNineSlice && imgFill && <NineSliceCanvas src={imgFill.src} slice={imgFill.slice!} />}
      {layout.map((row, r) => (
        <div className="vk-row" style={{ gap: style.gap }} key={r}>
          {row.map((cap, c) => {
            const id = `${r}-${c}-${cap.label}`;
            const active = activeKey === id;
            const override = {
              ...(cap.special ? style.specialKey : undefined),
              ...(active ? style.keyActive : undefined),
            };
            const css: CSSProperties = {
              ...keyStyleToCss(style.key, override),
              flexGrow: cap.flex ?? 1,
              flexBasis: 0,
            };
            // 元素级点选：Alt+点击 或 右键 选中单个键（字母键/功能键）
            const elLabel = cap.special ? "功能键" : "字母键";
            const isPicked = pickedLabel === elLabel;
            const onPick = (e: React.MouseEvent) => {
              if (!onPickElement) return;
              if (e.altKey || e.button === 2 || e.type === "contextmenu") {
                e.preventDefault();
                e.stopPropagation();
                onPickElement({ label: elLabel, token: "按键" });
              }
            };
            return (
              <button
                key={id}
                type="button"
                className={`vk-key${isPicked ? " pick-target" : ""}`}
                style={css}
                data-key={cap.label}
                onPointerDown={(e) => onDown(cap, id, e)}
                onPointerUp={(e) => onUp(cap, id, e)}
                onPointerCancel={reset}
                onContextMenu={onPick}
                title={onPickElement ? `右键/Alt+点击 点选「${elLabel}」提反馈` : undefined}
              >
                {cap.secondary && <span className="vk-secondary">{cap.secondary}</span>}
                <span className="vk-label">{cap.label}</span>
                {cap.sub && <span className="vk-sub">{cap.sub}</span>}
                {popupKey === id && cap.secondary && (
                  <span className="key-popup" data-testid="key-popup">{cap.secondary}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
