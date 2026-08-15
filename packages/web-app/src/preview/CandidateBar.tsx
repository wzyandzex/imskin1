/**
 * 候选栏 —— 展示拼音串 + 候选词（带序号、选中高亮、翻页）。皮肤驱动其配色与字体。
 */

import type { CSSProperties } from "react";
import type { SessionView } from "@imskin/pinyin-engine";
import type { CandidateBarStyle } from "@imskin/skin-gen";
import { fillToBackground, fontToCss } from "../skin/fills.ts";
import { NineSliceCanvas } from "../skin/NineSliceCanvas.tsx";

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
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onSelect(i);
                  }}
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
