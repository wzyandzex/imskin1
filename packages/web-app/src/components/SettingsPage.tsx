/**
 * 设置中心（可扩展）。
 *
 * 结构：左侧分类导航（注册表驱动）+ 右侧内容（居中，最大宽度）+ 「← 返回应用」+ 搜索框。
 * 分类、设置项都是数据——以后加新分类（外观/账户…）只是往 CATEGORIES 加一条、
 * 在对应面板组件里加配置行，不改框架。
 *
 * 目前实装：常规（占位说明）、接入模型（多配置管理 + 全面参数 + 启用开关）、键盘快捷键。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SHORTCUTS, actionForCombo, normalizeCombo } from "../shortcuts.ts";
import {
  type ModelConfig,
  type ModelConfigs,
  capabilityOf,
  currentTier,
  newConfig,
} from "../modelConfigs.ts";
import { LLMRegistry } from "@imskin/llm-core";

/* ———— 分类注册表：以后要扩展就加一条 ———— */
interface Category {
  id: string;
  label: string;
  icon: string;
  group: string;
}
const CATEGORIES: Category[] = [
  { id: "general", label: "常规", icon: "⚙️", group: "个人" },
  { id: "models", label: "接入模型", icon: "🔌", group: "个人" },
  { id: "shortcuts", label: "键盘快捷键", icon: "⌨️", group: "个人" },
];

interface Props {
  onBack: () => void;
  combos: Record<string, string>;
  onSetCombo: (id: string, combo: string) => void;
  modelConfigs: ModelConfigs;
  onModelConfigsChange: (mc: ModelConfigs) => void;
  /** 打开时默认选中的分类（如 switch-model 快捷键直接进模型页）。 */
  initialCat?: string;
}

export function SettingsPage({ onBack, combos, onSetCombo, modelConfigs, onModelConfigsChange, initialCat = "general" }: Props) {
  const [cat, setCat] = useState(initialCat);
  const [query, setQuery] = useState("");

  // UX-005 dialog 语义：打开时焦点移入、Esc 关闭、关闭后焦点还给触发者。
  // onBack 经 ref 引用（App 传内联箭头函数，每次渲染都变），避免 effect 反复重挂。
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") backRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // 焦点还原：优先还给打开者；若打开者已卸载（弹出菜单项）或从未获得焦点
      // （如键盘/程序化打开，activeElement 仍是 body），回退到常驻设置入口，
      // 避免焦点散落到 body（WAI-ARIA dialog 关闭语义）。
      const restore =
        prev && prev !== document.body && prev.isConnected
          ? prev
          : document.querySelector<HTMLElement>("[data-settings-opener]");
      restore?.focus();
    };
  }, []);

  return (
    <div
      className="settings"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      tabIndex={-1}
      data-testid="settings-page"
    >
      <aside className="settings-nav">
        <button type="button" className="settings-back" onClick={onBack} data-testid="settings-back">
          ← 返回应用
        </button>
        <div className="settings-search">
          <span aria-hidden>🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索设置…"
            aria-label="搜索设置"
            data-testid="settings-search"
          />
        </div>
        <NavBody cat={cat} onPick={setCat} />
      </aside>

      <main className="settings-main">
        <div className="settings-content">
          {cat === "general" && <GeneralPanel />}
          {cat === "models" && <ModelsPanel mc={modelConfigs} onChange={onModelConfigsChange} query={query} />}
          {cat === "shortcuts" && <ShortcutsPanel combos={combos} onSetCombo={onSetCombo} query={query} />}
        </div>
      </main>
    </div>
  );
}

function NavBody({ cat, onPick }: { cat: string; onPick: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of CATEGORIES) {
      if (!m.has(c.group)) m.set(c.group, []);
      m.get(c.group)!.push(c);
    }
    return [...m.entries()];
  }, []);
  return (
    <nav className="settings-tree">
      {groups.map(([g, items]) => (
        <div key={g} className="settings-group">
          <div className="settings-group-label">{g}</div>
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`settings-item${cat === c.id ? " active" : ""}`}
              onClick={() => onPick(c.id)}
              data-testid={`settings-cat-${c.id}`}
            >
              <span className="settings-item-icon" aria-hidden>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/* ———— 常规（占位：留扩展位） ———— */
function GeneralPanel() {
  return (
    <section className="settings-panel" data-testid="settings-general">
      <h2>常规</h2>
      <p className="settings-placeholder">
        常规设置项将在这里配置（主题、语言、默认导出目标等）。当前版本把核心能力集中在「接入模型」与「键盘快捷键」，
        其余分类会随后续迭代加入——左侧导航与面板均为注册表驱动，可直接扩展。
      </p>
    </section>
  );
}

/* ———— 接入模型：多配置管理 ———— */
function ModelsPanel({
  mc,
  onChange,
  query,
}: {
  mc: ModelConfigs;
  onChange: (mc: ModelConfigs) => void;
  query: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  /** 测试连接结果（per 配置 id）；testingId = 正在测试的配置。 */
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  /** 测试连接：用该配置发一个最小结构化请求，验证 baseUrl/key/model 可用。 */
  const testCfg = async (cfg: ModelConfig) => {
    if (!cfg.baseUrl.trim() || !cfg.model.trim()) {
      setTests((t) => ({ ...t, [cfg.id]: { ok: false, message: "请先填 Base URL 和模型名" } }));
      return;
    }
    setTestingId(cfg.id);
    try {
      const r = new LLMRegistry();
      r.register({ id: cfg.id, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey || undefined, model: cfg.model, timeoutMs: cfg.timeoutMs, headers: cfg.headers });
      await r.structured({
        messages: [{ role: "user", content: "回复 {\"ok\":true}" }],
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
        schemaName: "Ping",
      });
      setTests((t) => ({ ...t, [cfg.id]: { ok: true, message: "连接成功，配置可用" } }));
    } catch (e) {
      setTests((t) => ({ ...t, [cfg.id]: { ok: false, message: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setTestingId(null);
    }
  };

  const addConfig = () => {
    const c = newConfig(seq);
    setSeq((n) => n + 1);
    const next = { configs: [...mc.configs, c], activeId: mc.activeId ?? c.id };
    onChange(next);
    setEditingId(c.id);
  };

  const updateConfig = (id: string, patch: Partial<ModelConfig>) => {
    onChange({ ...mc, configs: mc.configs.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  };

  const removeConfig = (id: string) => {
    const next = mc.configs.filter((c) => c.id !== id);
    onChange({ configs: next, activeId: mc.activeId === id ? (next[0]?.id ?? null) : mc.activeId });
  };

  const setActive = (id: string) => onChange({ ...mc, activeId: id });

  const filtered = mc.configs.filter(
    (c) => !query || c.label.toLowerCase().includes(query.toLowerCase()) || c.model.toLowerCase().includes(query.toLowerCase()) || c.baseUrl.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="settings-panel" data-testid="settings-models">
      <div className="panel-header">
        <h2>接入模型</h2>
        <button type="button" className="gen-btn small" onClick={addConfig} data-testid="model-add">+ 添加配置</button>
      </div>
      <p className="settings-hint">
        管理你的 LLM 接入。每套配置是一个 OpenAI 兼容的 <code>base_url + api_key + model</code> 三元组。
        可配多套并在输入区切换器里选用。启用开关控制是否生效；禁用的配置保留但不进注册表。
        密钥仅存你本机浏览器。
      </p>
      <div className="model-list">
        {filtered.length === 0 && (
          <div className="settings-placeholder">还没有模型配置。点「添加配置」接入你的第一个模型。</div>
        )}
        {filtered.map((c) => (
          <div key={c.id} className={`model-card${c.enabled ? "" : " disabled"}${mc.activeId === c.id ? " active" : ""}`} data-testid={`model-card-${c.id}`}>
            <div className="model-card-head">
              <label className="model-enable">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => updateConfig(c.id, { enabled: e.target.checked })}
                  data-testid={`model-enabled-${c.id}`}
                />
                <span className="model-dot-dot" data-on={c.enabled} aria-hidden />
              </label>
              <div className="model-card-title">
                <input
                  className="model-label-input"
                  value={c.label}
                  onChange={(e) => updateConfig(c.id, { label: e.target.value })}
                  placeholder="显示名（如 DeepSeek）"
                  data-testid={`model-label-${c.id}`}
                />
                <span className="model-card-model">{c.model || "（未填模型）"}</span>
              </div>
              <div className="model-card-actions">
                {c.enabled && (
                  <button
                    type="button"
                    className={`link-btn${mc.activeId === c.id ? " current" : ""}`}
                    onClick={() => setActive(c.id)}
                    disabled={mc.activeId === c.id}
                    data-testid={`model-activate-${c.id}`}
                  >
                    {mc.activeId === c.id ? "当前" : "设为当前"}
                  </button>
                )}
                <button type="button" className="link-btn" onClick={() => setEditingId(editingId === c.id ? null : c.id)} data-testid={`model-toggle-edit-${c.id}`}>
                  {editingId === c.id ? "收起" : "编辑"}
                </button>
                <button type="button" className="link-btn danger" onClick={() => removeConfig(c.id)} data-testid={`model-remove-${c.id}`}>删除</button>
              </div>
            </div>
            {editingId === c.id && (
              <div className="model-card-body" data-testid={`model-edit-${c.id}`}>
                <label className="llm-field">
                  <span>Base URL</span>
                  <input value={c.baseUrl} onChange={(e) => updateConfig(c.id, { baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1 或 http://localhost:11434/v1" data-testid={`model-baseurl-${c.id}`} />
                </label>
                <label className="llm-field">
                  <span>模型名</span>
                  <input value={c.model} onChange={(e) => updateConfig(c.id, { model: e.target.value, reasoningTierId: undefined })} placeholder="deepseek-chat / qwen2.5 / gpt-4o-mini / o4-mini" data-testid={`model-model-${c.id}`} />
                </label>
                <label className="llm-field">
                  <span>API Key</span>
                  <input type="password" value={c.apiKey ?? ""} onChange={(e) => updateConfig(c.id, { apiKey: e.target.value })} placeholder="sk-...（Ollama 可留空）" data-testid={`model-apikey-${c.id}`} />
                </label>
                <label className="llm-field">
                  <span>超时（毫秒）</span>
                  <input type="number" value={c.timeoutMs ?? 30000} onChange={(e) => updateConfig(c.id, { timeoutMs: Number(e.target.value) || undefined })} data-testid={`model-timeout-${c.id}`} />
                </label>
                {/* 推理强度档位（按厂商/模型动态） */}
                <div className="llm-field">
                  <span>推理强度（按模型动态）</span>
                  <div className="tier-chips">
                    {capabilityOf(c).tiers.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`tier-chip${(c.reasoningTierId ?? currentTier(c).id) === t.id ? " active" : ""}`}
                        onClick={() => updateConfig(c.id, { reasoningTierId: t.id })}
                        data-testid={`model-tier-${c.id}-${t.id}`}
                      >
                        {t.label}
                        {t.hint && <span className="tier-hint">{t.hint}</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <details className="llm-advanced">
                  <summary>高级：自定义请求头（每行一个 Key: Value）</summary>
                  <textarea
                    value={Object.entries(c.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")}
                    onChange={(e) => {
                      const headers: Record<string, string> = {};
                      for (const line of e.target.value.split("\n")) {
                        const i = line.indexOf(":");
                        if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
                      }
                      updateConfig(c.id, { headers });
                    }}
                    placeholder="X-Org-Id: my-org&#10;X-Custom: value"
                    data-testid={`model-headers-${c.id}`}
                  />
                </details>
                {/* 测试连接：真实验证 baseUrl/key/model 可用（错误原文回显，便于排查） */}
                <div className="model-test-row">
                  <button type="button" className="gen-btn small" onClick={() => testCfg(c)} disabled={testingId === c.id} data-testid={`model-test-${c.id}`}>
                    {testingId === c.id ? "测试中…" : "测试连接"}
                  </button>
                  {tests[c.id] && (
                    <span className={`model-test-result${tests[c.id].ok ? " ok" : " err"}`} data-testid={`model-test-result-${c.id}`}>
                      {tests[c.id].ok ? "✔ " : "✘ "}{tests[c.id].message}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ———— 键盘快捷键 ———— */
function ShortcutsPanel({
  combos,
  onSetCombo,
  query,
}: {
  combos: Record<string, string>;
  onSetCombo: (id: string, combo: string) => void;
  query: string;
}) {
  const [recording, setRecording] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const rows = SHORTCUTS.filter(
    (a) =>
      !query ||
      a.label.toLowerCase().includes(query.toLowerCase()) ||
      a.hint.toLowerCase().includes(query.toLowerCase()) ||
      (combos[a.id] ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const onCapture = (id: string, e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(null);
      setConflict(null);
      return;
    }
    const combo = normalizeCombo(e);
    if (!combo) return;
    const usedBy = actionForCombo(combos, combo);
    if (usedBy && usedBy !== id) {
      setConflict(`「${combo}」已被「${SHORTCUTS.find((s) => s.id === usedBy)?.label ?? usedBy}」占用`);
      return;
    }
    onSetCombo(id, combo);
    setRecording(null);
    setConflict(null);
  };

  return (
    <section className="settings-panel" data-testid="settings-shortcuts">
      <h2>键盘快捷键</h2>
      <div className="shortcut-list">
        {rows.map((a) => {
          const combo = combos[a.id] ?? "";
          const isRec = recording === a.id;
          return (
            <div key={a.id} className="shortcut-row" data-testid={`shortcut-row-${a.id}`}>
              <div className="shortcut-text">
                <div className="shortcut-label">{a.label}</div>
                <div className="shortcut-hint">{a.hint}</div>
              </div>
              {isRec ? (
                <input
                  className="shortcut-capture"
                  autoFocus
                  readOnly
                  value="按下按键…（Esc 取消）"
                  onKeyDown={(e) => onCapture(a.id, e)}
                  onBlur={() => { setRecording(null); setConflict(null); }}
                  data-testid={`shortcut-capture-${a.id}`}
                />
              ) : (
                <>
                  {combo ? <kbd className="kbd">{combo}</kbd> : <span className="shortcut-unset">未分配</span>}
                  <button
                    type="button"
                    className="shortcut-edit"
                    title="重新绑定"
                    aria-label={`重新绑定${a.label}`}
                    onClick={() => { setRecording(a.id); setConflict(null); }}
                    data-testid={`shortcut-edit-${a.id}`}
                  >
                    ✎
                  </button>
                  {combo && (
                    <button
                      type="button"
                      className="shortcut-clear"
                      title="清除绑定"
                      aria-label={`清除${a.label}绑定`}
                      onClick={() => onSetCombo(a.id, "")}
                      data-testid={`shortcut-clear-${a.id}`}
                    >
                      🗑
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {conflict && <div className="shortcut-conflict" data-testid="shortcut-conflict">{conflict}</div>}
    </section>
  );
}
