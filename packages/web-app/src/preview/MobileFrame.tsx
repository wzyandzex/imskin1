/**
 * 竖屏手机外壳 —— 让皮肤"装在手机上"的样子（架构 §4.8）。纯 CSS 机身 + 安全区 + 底部指示条。
 * 内含的 PreviewRuntime 会把落地文本框排在上方、键盘停靠底部，读起来就是手机输入场景。
 *
 * FR-PREVIEW-7 多机型 DPI 档位：用 CSS transform 缩放模拟不同屏幕密度下的渲染效果——
 * 低密度（标清）暴露"按键过小/贴图粗糙"，高密度（超清）暴露"切图发虚/拉伸失真"。
 * 同时把档位标注在外壳上，让用户随时知道"现在看的是哪种手机上的效果"（AC2 不混淆）。
 */

import type { ReactNode } from "react";

export type DpiTier = "sd" | "hd" | "uhd";

interface Props {
  children: ReactNode;
  /** 屏幕密度档位：sd 标清(~160dpi) / hd 高清(~320dpi，默认) / uhd 超高清(~480dpi)。 */
  dpi?: DpiTier;
}

/** 各档位的渲染缩放（>1 放大模拟高密度"发虚/拉伸"，<1 缩小模拟低密度）。 */
const DPI_SCALE: Record<DpiTier, number> = { sd: 0.85, hd: 1, uhd: 1.12 };
const DPI_LABEL: Record<DpiTier, string> = { sd: "标清 · ~160dpi", hd: "高清 · ~320dpi", uhd: "超清 · ~480dpi" };

export function MobileFrame({ children, dpi = "hd" }: Props) {
  const scale = DPI_SCALE[dpi];
  return (
    <div className="mobile-frame" data-testid="mobile-frame" data-dpi={dpi}>
      <div className="mobile-notch" />
      <div className="mobile-screen">
        {/* 缩放层：模拟不同 DPI 下的渲染密度。放大用 transform 而非改尺寸，以暴露"拉伸发虚"观感。 */}
        <div className="dpi-scale" style={{ transform: `scale(${scale})`, transformOrigin: "center bottom" }}>
          {children}
        </div>
      </div>
      <div className="mobile-home-indicator" />
      <div className="dpi-badge" data-testid="dpi-badge">{DPI_LABEL[dpi]}</div>
    </div>
  );
}
