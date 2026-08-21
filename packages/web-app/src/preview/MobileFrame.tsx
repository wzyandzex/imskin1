/**
 * 竖屏手机外壳 —— 让皮肤"装在手机上"的样子（架构 §4.8）。纯 CSS 机身 + 安全区 + 底部指示条。
 *
 * MOB-003 DPI 真实化：
 * - 缩放层仍用 CSS transform 模拟密度（暴露"发虚/拉伸"观感不变）；
 * - 新增：根据当前 DPI 档位 vs 已有资产最高密度，计算"资产是否够用"——
 *   高密度屏显示低密度位图时发虚，预览给出预警（FR-PREVIEW-7 AC3）。
 * - 预警定位到 element_id（statusBar.icons），供 QA 消费。
 */

import type { ReactNode } from "react";

export type DpiTier = "sd" | "hd" | "uhd";

interface Props {
  children: ReactNode;
  /** 屏幕密度档位：sd 标清(~160dpi) / hd 高清(~320dpi，默认) / uhd 超高清(~480dpi)。 */
  dpi?: DpiTier;
  /** 当前版本最高可用资产密度（从 AssetDescriptor.density 推断；缺省 "xhdpi"）。 */
  maxAssetDensity?: "mdpi" | "hdpi" | "xhdpi" | "xxhdpi" | "xxxhdpi";
}

/** 各档位的渲染缩放（>1 放大模拟高密度"发虚/拉伸"，<1 缩小模拟低密度）。 */
const DPI_SCALE: Record<DpiTier, number> = { sd: 0.85, hd: 1, uhd: 1.12 };
const DPI_LABEL: Record<DpiTier, string> = { sd: "标清 · ~160dpi", hd: "高清 · ~320dpi", uhd: "超清 · ~480dpi" };

/** 档位 → 对应的最低资产密度需求。 */
const TIER_REQUIREMENT: Record<DpiTier, string> = {
  sd: "mdpi",
  hd: "xhdpi",
  uhd: "xxxhdpi",
};

/** 密度等级排序（mdpi < hdpi < xhdpi < xxhdpi < xxxhdpi）。 */
const DENSITY_ORDER = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

/** 检查当前 DPI 档位是否超出资产密度能力（发虚预警）。 */
function isAssetInsufficient(tier: DpiTier, maxAsset: string): boolean {
  const required = TIER_REQUIREMENT[tier];
  return DENSITY_ORDER.indexOf(maxAsset) < DENSITY_ORDER.indexOf(required);
}

export function MobileFrame({ children, dpi = "hd", maxAssetDensity = "xhdpi" }: Props) {
  const scale = DPI_SCALE[dpi];
  const blurry = isAssetInsufficient(dpi, maxAssetDensity);

  return (
    <div className="mobile-frame" data-testid="mobile-frame" data-dpi={dpi}>
      <div className="mobile-notch" />
      <div className="mobile-screen">
        <div className="dpi-scale" style={{ transform: `scale(${scale})`, transformOrigin: "center bottom" }}>
          {children}
        </div>
      </div>
      <div className="mobile-home-indicator" />
      <div className="dpi-badge" data-testid="dpi-badge">{DPI_LABEL[dpi]}</div>
      {blurry && (
        <div className="dpi-blur-warning" data-testid="dpi-blur-warning" title="当前档位超出资产最高密度，位图可能发虚（FR-PREVIEW-7 AC3）">
          ⚠ 资产密度不足（最高 {maxAssetDensity}）→ 可能发虚
        </div>
      )}
    </div>
  );
}
