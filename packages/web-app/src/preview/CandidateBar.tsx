/**
 * 候选栏 —— 展示拼音串 + 候选词（带序号、选中高亮、翻页）。皮肤驱动其配色与字体。
 *
 * MOB-001 候选横向滑动翻页：在候选词上左滑 → 下一页，右滑 → 上一页。
 * 判定与选词共用同一手势流（pointerdown 记起点 + capture，pointerup 算水平位移）：
 * 位移 ≥ SWIPE_PX 视为翻页（不选词）；否则视为点选。与虚拟键盘的手势模式一致。
 */

import { useRef, type CSSProperties, type PointerEvent } from "react";
import type { SessionView } from "@imskin/pinyin-engine";
import type { CandidateBarStyle } from "@imskin/skin-gen";
import { fillToBackground, fontToCss } from "../skin/fills.ts";
import { NineSliceCanvas } from "../skin/NineSliceCanvas.tsx";

const SWIPE_PX = 40;

interface Props {
  view: SessionView;
  style: CandidateBarStyle;
  onSelect: (indexOnPage: number) => void;
  onPageUp: () => void;
  onPageDown: () => void;
  /** 元素级点选反馈（FR-FEEDBACK-5）。 */
  onPickElement?: (el: { label: string; token: string }) => void;
  pickedLabel?: string | null;
}

export function CandidateBar({ view, style, onSelect, onPageUp, onPageDown, onPickElement, pickedLabel }: Props) {
  const swipe = useRef<{ startX: number } | null>(null);
  const composingText =
    view.composing.join("'") + (view.remainder ? (view.composing.length ? "'" : "") + view.remainder : "");

  // 位图九宫格背景与键盘一致（§4.7）：image 填充走 Canvas 层，纯色/渐变走 CSS。
  const imgFill = style.background.type === "image" ? style.background : null;
  const useNineSlice = imgFill !== null && imgFill.slice !== undefined;

  const barStyle: CSSProperties = {
    background: useNineSlice ? "transparent" : fillToBackground(style.background),
    ...fontToCss(style.font),
  };

  const pick = (label: string, token: string) => (e: React.MouseEvent) => {
    if (!onPickElement) return;
    e.preventDefault();
    e.stopPropagation();
    onPickElement({ label, token });
  };
  const pk = (label: string) => (pickedLabel === label ? " pick-target" : "");

  // —— MOB-001 候选词手势：down 记起点并捕获，up 判滑动/点选 ——
  const onCandDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    swipe.current = { startX: e.clientX };
  };
  const onCandUp = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    const startX = swipe.current?.startX;
    swipe.current = null;
    if (startX !== undefined) {
      const dx = startX - e.clientX; // >0 左滑（下一页），<0 右滑（上一页）
      if (Math.abs(dx) >= SWIPE_PX) {
        if (dx > 0) onPageDown();
        else onPageUp();
        return; // 翻页手势不选词
      }
    }
    onSelect(index);
  };

  return (
    <div className={`candidate-bar${pk("候选栏背景")}`} style={barStyle} data-testid="candidate-bar" onClick={onPickElement ? pick("候选栏背景", "候选栏背景") : undefined}>
      {useNineSlice && imgFill && <NineSliceCanvas src={imgFill.src} slice={imgFill.slice!} />}
      {view.composingActive ? (
        <>
          <span className={`composing${pk("拼音串")}`} style={{ color: style.composingColor }} data-testid="composing" onClick={onPickElement ? pick("拼音串", "候选") : undefined}>
            {composingText || " "}
          </span>
          <div className="candidates" data-testid="candidates">
            {view.candidates.map((c, i) => {
              const selected = i === 0;
              const chipStyle: CSSProperties = selected
                ? { background: fillToBackground(style.selectedFill), color: style.selectedColor }
                : { color: style.candidateColor };
              const elLabel = selected ? "选中候选" : "候选词";
              const elToken = selected ? "候选选中" : "候选";
              return (
                <button
                  key={`${c.word}-${i}`}
                  type="button"
                  className={`candidate${selected ? " selected" : ""}${pk(elLabel)}`}
                  style={chipStyle}
                  onPointerDown={onCandDown}
                  onPointerUp={(e) => onCandUp(e, i)}
                  onContextMenu={onPickElement ? pick(elLabel, elToken) : undefined}
                  title={onPickElement ? `右键 点选「${elLabel}」提反馈` : undefined}
                >
                  <span className="cand-index" style={{ color: selected ? style.selectedColor : style.indexColor }}>
                    {i + 1}
                  </span>
                  <span className="cand-word">{c.word}</span>
                </button>
              );
            })}
          </div>
          <div className="pager">
            <button
              type="button"
              className="pager-btn"
              disabled={view.page === 0}
              style={{ color: style.indexColor }}
              onPointerDown={(e) => {
                e.preventDefault();
                onPageUp();
              }}
              aria-label="上一页"
            >
              ‹
            </button>
            <button
              type="button"
              className="pager-btn"
              disabled={!view.hasMore}
              style={{ color: style.indexColor }}
              onPointerDown={(e) => {
                e.preventDefault();
                onPageDown();
              }}
              aria-label="下一页"
            >
              ›
            </button>
          </div>
        </>
      ) : (
        <span className="hint" style={{ color: style.composingColor }}>
          输入拼音试试这套皮肤 · 像平常打字一样
        </span>
      )}
    </div>
  );
}
