/**
 * 多套 LLM 模型配置（用户可在设置里管理多个接入，在输入区切换器里选其一）。
 *
 * 每套配置 = 一个 LLMProviderConfig + 启用开关 + 当前推理强度档位 + 显示名。
 * 存 localStorage；启用的配置进 registry，切换器列出它们供用户选。
 *
 * 向后兼容：若存在旧的 imskin:llm:v1 单配置，迁移成一条 configs 记录。
 */

import type { LLMProviderConfig } from "@imskin/llm-core";
import { capabilityForModel, defaultTier, tierById } from "@imskin/llm-core";

const KEY = "imskin:llm:v2";
const LEGACY_KEY = "imskin:llm:v1";

export interface ModelConfig extends LLMProviderConfig {
  /** 显示名（如 "DeepSeek" / "本地 Qwen"），切换器里展示。 */
  label: string;
  /** 是否启用（启用才进 registry / 出现在切换器；禁用则保留配置但不生效）。 */
  enabled: boolean;
  /** 当前选的推理强度档位 id（按 capabilityForModel(model).tiers 取）。 */
  reasoningTierId?: string;
}

export interface ModelConfigs {
  /** 所有配置（含禁用的）。 */
  configs: ModelConfig[];
  /** 当前选中的配置 id（切换器的"当前模型"）。 */
  activeId: string | null;
}

export function emptyConfigs(): ModelConfigs {
  return { configs: [], activeId: null };
}

/** 从 localStorage 加载；兼容旧版单配置迁移。 */
export function loadConfigs(): ModelConfigs {
  try {
    if (typeof localStorage === "undefined") return emptyConfigs();
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as ModelConfigs;
      if (Array.isArray(o.configs)) return o;
    }
    // 旧版迁移
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Partial<LLMProviderConfig>;
      if (old.baseUrl && old.model) {
        const c: ModelConfig = {
          id: "migrated",
          label: "我的模型",
          baseUrl: old.baseUrl,
          apiKey: old.apiKey,
          model: old.model,
          enabled: true,
        };
        const mc = { configs: [c], activeId: "migrated" };
        saveConfigs(mc);
        localStorage.removeItem(LEGACY_KEY); // 迁移完成，清掉旧 key 防脏数据
        return mc;
      }
    }
  } catch {
    /* ignore */
  }
  return emptyConfigs();
}

export function saveConfigs(mc: ModelConfigs): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(mc));
  } catch {
    /* ignore */
  }
}

/** 启用的配置（进 registry / 出现在切换器）。 */
export function enabledConfigs(mc: ModelConfigs): ModelConfig[] {
  return mc.configs.filter((c) => c.enabled);
}

/** 当前生效的配置（activeId 指向且 enabled 的；否则取第一个 enabled）。 */
export function activeConfig(mc: ModelConfigs): ModelConfig | null {
  const ens = enabledConfigs(mc);
  if (ens.length === 0) return null;
  const byId = mc.activeId ? ens.find((c) => c.id === mc.activeId) : null;
  return byId ?? ens[0];
}

/** 某配置当前选的推理档位（按其模型能力动态取）。 */
export function currentTier(c: ModelConfig) {
  const cap = capabilityForModel(c.model);
  return tierById(cap, c.reasoningTierId);
}

/** 某配置的推理能力（供切换器列档位）。 */
export function capabilityOf(c: ModelConfig) {
  return capabilityForModel(c.model);
}

/** 新建一个空配置（带默认 id）。 */
export function newConfig(seq: number): ModelConfig {
  return {
    id: `model-${Date.now()}-${seq}`,
    label: "",
    baseUrl: "",
    apiKey: "",
    model: "",
    enabled: true,
    reasoningTierId: defaultTier(capabilityForModel("")).id,
  };
}
