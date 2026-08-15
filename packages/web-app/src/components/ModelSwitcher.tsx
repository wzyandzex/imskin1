/**
 * 模型切换器：挂在输入区，显示当前模型 + 推理强度，点击弹两级菜单选模型/改强度。
 * 对齐 Codex 那种交互：常态显示 "模型名 · 强度"，悬停 tooltip，点击弹菜单（模型列表 / 推理强度子项）。
 *
 * 数据来自 ModelConfigs（设置里配的）；改强度/切模型直接回写。
 */

import { useEffect, useRef, useState } from "react";
import type { ModelConfigs, ModelConfig } from "../modelConfigs.ts";
import { capabilityOf, currentTier, enabledConfigs } from "../modelConfigs.ts";
import { Tooltip } from "./Tooltip.tsx";

interface Props {
  mc: ModelConfigs;
  onChange: (mc: ModelConfigs) => void;
  /** 无模型时点击 → 打开设置·接入模型（由 App 提供，避免组件反向依赖）。 */
  onOpenSettings: () => void;
  /** 切换模型快捷键（随用户改键动态显示；空串则不显示）。 */
  combo?: string | null;
}

type Pane = "root" | "models" | "tier";

export function ModelSwitcher({ mc, onChange, onOpenSettings, combo }: Props) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("root");
  const ref = useRef<HTMLDivElement | null>(null);

  // 点外部关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setPane("root"); }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const ens = enabledConfigs(mc);
  const active = ens.find((c) => c.id === mc.activeId) ?? ens[0] ?? null;

  if (!active) {
    // 没有启用的模型：显示"未接入"，点击直达设置·接入模型
    return (
      <Tooltip label="未接入模型，点击去设置" side="top" className="switcher-tip">
        <button type="button" className="model-switcher empty" onClick={onOpenSettings} data-testid="model-switcher" aria-label="未接入模型，去设置">
          <span className="ms-label">未接入模型</span>
        </button>
      </Tooltip>
    );
  }

  const tier = currentTier(active);
  const cap = capabilityOf(active);

  const setActive = (id: string) => { onChange({ ...mc, activeId: id }); setOpen(false); setPane("root"); };
  const setTier = (tierId: string) => {
    onChange({ ...mc, configs: mc.configs.map((c) => (c.id === active.id ? { ...c, reasoningTierId: tierId } : c)) });
    setPane("root");
  };

  const trigger = (
    <button
      type="button"
      className="model-switcher"
      onClick={() => { setOpen((o) => !o); setPane("root"); }}
      aria-haspopup="menu"
      aria-expanded={open}
      data-testid="model-switcher"
    >
      <span className="ms-model">{active.label || active.model}</span>
      <span className="ms-sep" aria-hidden>·</span>
      <span className="ms-tier">{tier.label}</span>
      <svg className="ms-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );

  return (
    <div className="model-switcher-wrap" ref={ref} data-testid="model-switcher-wrap">
      {/* 菜单打开时不包 Tooltip：避免按钮 focus 触发的气泡与上方菜单重叠 */}
      {open ? trigger : (
        <Tooltip label="选择模型" combo={combo || null} side="top" className="switcher-tip">
          {trigger}
        </Tooltip>
      )}
      {open && (
        <div className="ms-menu" role="menu" data-testid="ms-menu">
          {pane === "root" && (
            <>
              <div className="ms-section">
                <button type="button" className="ms-row" onClick={() => setPane("models")} data-testid="ms-goto-models">
                  <span className="ms-row-label">模型</span>
                  <span className="ms-row-value">{active.label || active.model}<svg className="ms-chev" width="10" height="10" viewBox="0 0 10 10"><path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                </button>
                <button type="button" className="ms-row" onClick={() => setPane("tier")} data-testid="ms-goto-tier">
                  <span className="ms-row-label">{cap.label}</span>
                  <span className="ms-row-value">{tier.label}<svg className="ms-chev" width="10" height="10" viewBox="0 0 10 10"><path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                </button>
              </div>
            </>
          )}
          {pane === "models" && (
            <div className="ms-subpane" data-testid="ms-subpane-models">
              <button type="button" className="ms-back" onClick={() => setPane("root")} data-testid="ms-back-models">← 返回</button>
              <div className="ms-sub-title">模型</div>
              {ens.map((c: ModelConfig) => (
                <button
                  key={c.id}
                  type="button"
                  className={`ms-opt${c.id === active.id ? " checked" : ""}`}
                  onClick={() => setActive(c.id)}
                  data-testid={`ms-model-${c.id}`}
                >
                  <span className="ms-opt-name">{c.label || c.model}</span>
                  <span className="ms-opt-sub">{c.model}</span>
                  {c.id === active.id && <span className="ms-check" aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}
          {pane === "tier" && (
            <div className="ms-subpane" data-testid="ms-subpane-tier">
              <button type="button" className="ms-back" onClick={() => setPane("root")} data-testid="ms-back-tier">← 返回</button>
              <div className="ms-sub-title">{cap.label}</div>
              {cap.tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ms-opt${(active.reasoningTierId ?? currentTier(active).id) === t.id ? " checked" : ""}`}
                  onClick={() => setTier(t.id)}
                  data-testid={`ms-tier-${t.id}`}
                >
                  <span className="ms-opt-name">{t.label}</span>
                  {t.hint && <span className="ms-opt-sub">{t.hint}</span>}
                  {(active.reasoningTierId ?? currentTier(active).id) === t.id && <span className="ms-check" aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
