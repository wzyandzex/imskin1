/**
 * 预览运行时 —— 把皮肤、虚拟键盘、候选栏、拼音引擎（InputSession）接成一个"像平常打字一样"
 * 的真实可交互输入法。支持物理键盘与点击两种输入；已上屏文本落进"落地文本框"。
 *
 * 关键：UI 无输入逻辑，所有按键（物理 + 点击）归一为 KeyAction → dispatch 到 session，
 * 再 render session.view()。这层的正确性由 pinyin-engine 的 session 单测 + 本包的交互测试共同保证。
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { InputSession, type InputMode } from "@imskin/pinyin-engine";
import type { SkinManifest } from "@imskin/skin-gen";
import { CandidateBar } from "./CandidateBar.tsx";
import { VirtualKeyboard } from "./VirtualKeyboard.tsx";
import { layoutFor } from "./layouts.ts";
import { dispatch, type KeyAction } from "./actions.ts";
import { KeySound } from "./sound.ts";

interface Props {
  skin: SkinManifest;
  /** 预览设备形态：pc（默认）或 mobile（竖屏手机键盘，更大触控目标 + 按键音）。 */
  device?: "pc" | "mobile";
  /** 是否开启按键音（仅在支持 Web Audio 时生效）。 */
  soundEnabled?: boolean;
  /** 会话初始输入模式：qwerty=26 键全键盘（默认）或 t9=九宫格。移动端默认 t9。 */
  initialMode?: InputMode;
  /** 元素级点选反馈（FR-FEEDBACK-5）：点选单个键/候选词触发。 */
  onPickElement?: (el: { label: string; token: string }) => void;
  /** 当前被选中的元素 label（用于高亮）。 */
  pickedLabel?: string | null;
}

export function PreviewRuntime({ skin, device = "pc", soundEnabled = false, initialMode = "qwerty", onPickElement, pickedLabel }: Props) {
  const sessionRef = useRef<InputSession | null>(null);
  if (sessionRef.current === null) sessionRef.current = new InputSession({ mode: initialMode });
  const session = sessionRef.current;

  const soundRef = useRef<KeySound | null>(null);
  if (soundRef.current === null) soundRef.current = new KeySound();
  useEffect(() => {
    soundRef.current?.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const run = useCallback(
    (action: KeyAction) => {
      soundRef.current?.playClick(action.type === "input" || action.type === "select" ? "normal" : "special");
      dispatch(session, action);
      rerender();
    },
    [session, rerender],
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const key = e.key;
      const view = session.view();

      if (key === "Backspace") {
        e.preventDefault();
        run({ type: "backspace" });
      } else if (key === "Enter") {
        e.preventDefault();
        run({ type: "enter" });
      } else if (key === " ") {
        e.preventDefault();
        run({ type: "space" });
      } else if (key === "Escape") {
        e.preventDefault();
        session.clearComposing();
        rerender();
      } else if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        if (view.mode === "qwerty" && view.composingActive && key !== "0") {
          run({ type: "select", index: Number(key) - 1 });
        } else {
          run({ type: "input", value: key });
        }
      } else if (/^[a-zA-Z]$/.test(key)) {
        e.preventDefault();
        run({ type: "input", value: key.toLowerCase() });
      } else if (key === ",") {
        e.preventDefault();
        run({ type: "literal", value: "，" });
      } else if (key === ".") {
        e.preventDefault();
        run({ type: "literal", value: "。" });
      }
    },
    [session, run, rerender],
  );

  const view = session.view();
  const inlineComposing = view.composingActive
    ? view.composing.join("") + view.remainder
    : "";

  return (
    <div
      className={`preview-stage${device === "mobile" ? " mobile" : ""}`}
      ref={stageRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="preview-stage"
      aria-label="皮肤预览，可直接打字"
    >
      {/* 落地文本框：模拟真实使用场景——正在某个输入框里打字 */}
      <div className="landing" data-testid="landing">
        <div className="landing-label">试打区</div>
        <div className="landing-text">
          <span data-testid="committed">{view.committedText}</span>
          {inlineComposing && <span className="inline-composing">{inlineComposing}</span>}
          <span className="caret" />
        </div>
      </div>

      <CandidateBar
        view={view}
        style={skin.candidateBar}
        onSelect={(i) => run({ type: "select", index: i })}
        onPageUp={() => {
          session.pageUp();
          rerender();
        }}
        onPageDown={() => {
          session.pageDown();
          rerender();
        }}
        onPickElement={onPickElement}
        pickedLabel={pickedLabel}
      />

      <VirtualKeyboard layout={layoutFor(view.mode)} style={skin.keyboard} onAction={run} onPickElement={onPickElement} pickedLabel={pickedLabel} />
    </div>
  );
}
