/**
 * 自定义 Tooltip：白底 / 细边 / 柔和阴影 / 左侧说明文字 + 右侧 kbd 快捷键徽标。
 *
 * 关键：气泡用 **fixed 定位 + 按触发物坐标计算**，脱离父级布局流——
 *   · 不参与 flex 排版（不会把顶栏"撑动"）；
 *   · 不被父级 overflow/border 裁切；
 *   · 计算时检测视口边缘，水平钳制 + 上方/下方自动翻转，角落按钮也不会被遮挡。
 * 静止约 280ms 后淡入，替代原生 title。
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  label: string;
  combo?: string | null;
  /** 期望弹出方向；空间不足会自动翻转。 */
  side?: "top" | "bottom";
  /** 额外类名（加到包裹 span 上，用于布局如 margin-left:auto）。 */
  className?: string;
  children: ReactNode;
}

const SHOW_DELAY = 280;
const GAP = 8; // 与触发物的间距
const EDGE = 8; // 离视口边缘的最小距离

interface Pos {
  left: number;
  top: number;
  placed: "top" | "bottom";
}

export function Tooltip({ label, combo, side = "bottom", className, children }: Props) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<number | null>(null);

  const open = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(true), SHOW_DELAY);
  };
  const close = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setShow(false);
  };
  // 卸载清掉未触发的悬停定时器：jsdom 测试环境卸载后 window 会被销毁，
  // 迟到的 setShow 会成为未捕获异常（曾在全量套件中以 Uncaught ReferenceError 出现）。
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  // 显示后测量气泡尺寸，按触发物坐标 + 视口边缘钳制计算最终位置
  useLayoutEffect(() => {
    if (!show || !wrapRef.current || !bubbleRef.current) return;
    const anchor = wrapRef.current.getBoundingClientRect();
    const bubble = bubbleRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 垂直：优先按 side，空间不够则翻转
    let placed: "top" | "bottom" = side;
    let top = side === "bottom" ? anchor.bottom + GAP : anchor.top - bubble.height - GAP;
    if (side === "bottom" && top + bubble.height > vh - EDGE) {
      placed = "top";
      top = anchor.top - bubble.height - GAP;
    } else if (side === "top" && top < EDGE) {
      placed = "bottom";
      top = anchor.bottom + GAP;
    }
    top = Math.max(EDGE, Math.min(top, vh - bubble.height - EDGE));

    // 水平：先居中于触发物，再钳制进视口
    let left = anchor.left + anchor.width / 2 - bubble.width / 2;
    left = Math.max(EDGE, Math.min(left, vw - bubble.width - EDGE));

    setPos({ left, top, placed });
  }, [show, side, label, combo]);

  return (
    <span className={`tooltip-wrap${className ? " " + className : ""}`} ref={wrapRef} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
      {children}
      {/* 气泡 portal 到 body：彻底脱离 .app-header 的 stacking context，
          否则 fixed 仍被父级 animation/transform 约束而被裁切。 */}
      {show &&
        createPortal(
          <span
            ref={bubbleRef}
            className={`tooltip-bubble tip-${pos?.placed ?? side}${pos ? " placed" : ""}`}
            style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
            role="tooltip"
          >
            <span className="tooltip-label">{label}</span>
            {combo ? <kbd className="kbd">{combo}</kbd> : null}
          </span>,
          document.body,
        )}
    </span>
  );
}
