/**
 * 资产契约（ASSET-001，docs/01 §8 / docs/02 §4）。
 *
 * 资产角色分两种载体：
 * - config：由 VisualSpec token 承载（颜色/字号等），检查 = token 路径存在；
 * - bitmap：必须存在真实位图 AssetDescriptor（hash/尺寸/状态），缺失即缺口。
 *
 * 诚实边界：当前图像生成产物尚未注册为 AssetDescriptor（A3 位图管道未接），
 * bitmap 角色将如实出现在 missing 清单——这正是 install_candidate 的闸门依据。
 */

import type { Outlet } from "./outlet.ts";

/** 语义资产角色（docs/01 §7.1 element 命名空间的资产子集）。 */
export type AssetRole =
  | "candidateBar.background"
  | "candidateBar.textNormal"
  | "candidateBar.textSelected"
  | "composing.text"
  | "statusBar.icons"
  | "keyboard.background"
  | "keyboard.keyNormal"
  | "keyboard.keyPressed"
  | "preview.image";

export type AssetCarrier = "config" | "bitmap";

export interface AssetProfileEntry {
  role: AssetRole;
  carrier: AssetCarrier;
  required: boolean;
  /** config 载体的 VisualSpec token 路径（点分）。bitmap 载体不设。 */
  tokenPath?: string;
  /** bitmap 载体允许的媒体类型。 */
  mediaTypes?: string[];
  /** bitmap 载体需要覆盖的密度档位（移动出口）。 */
  densities?: string[];
}

export interface AssetProfileV1 {
  schemaVersion: 1;
  outlet: Outlet;
  entries: AssetProfileEntry[];
}

/** 已注册的位图资产描述符（来自 A3 生成或用户素材；含内容指纹）。 */
export interface AssetDescriptorV1 {
  id: string;
  role: AssetRole;
  mediaType: string;
  contentHash: string;
  byteLength: number;
  dimensions?: { width: number; height: number };
  density?: string;
  state?: "normal" | "pressed" | "hover" | "selected";
  source: "generated" | "user";
}

export const ASSET_ROLES: readonly AssetRole[] = [
  "candidateBar.background",
  "candidateBar.textNormal",
  "candidateBar.textSelected",
  "composing.text",
  "statusBar.icons",
  "keyboard.background",
  "keyboard.keyNormal",
  "keyboard.keyPressed",
  "preview.image",
];

const CONFIG_CORE: AssetProfileEntry[] = [
  { role: "candidateBar.background", carrier: "config", required: true, tokenPath: "candidateBar.bg" },
  { role: "candidateBar.textNormal", carrier: "config", required: true, tokenPath: "candidateBar.candidate" },
  { role: "candidateBar.textSelected", carrier: "config", required: true, tokenPath: "candidateBar.selectedText" },
  { role: "composing.text", carrier: "config", required: true, tokenPath: "candidateBar.composing" },
  { role: "keyboard.keyNormal", carrier: "config", required: false, tokenPath: "keyboard.keyFill" },
  { role: "keyboard.keyPressed", carrier: "config", required: false, tokenPath: "keyboard.keyActiveFill" },
];

const STATUS_ICONS: AssetProfileEntry = {
  role: "statusBar.icons",
  carrier: "bitmap",
  required: true,
  mediaTypes: ["image/png"],
};

const PREVIEW_IMAGE: AssetProfileEntry = {
  role: "preview.image",
  carrier: "bitmap",
  required: false,
  mediaTypes: ["image/png"],
};

/** A3-002：键盘背景位图（可选——gradient 是合法替代，ADR-008）。 */
const KEYBOARD_BG: AssetProfileEntry = {
  role: "keyboard.background",
  carrier: "bitmap",
  required: false,
  mediaTypes: ["image/png"],
};

/**
 * 搜狗 PC 资产画像首版（docs/02 §5.4 依据）：候选/拼音/按键由 config token 满足（必需要有）；
 * 状态栏图标在真实 .ssf 中为 png 位图 → bitmap 必需（当前缺失 = install_candidate 闸门缺口）。
 */
export const SOGOU_PC_ASSET_PROFILE: AssetProfileV1 = {
  schemaVersion: 1,
  outlet: "sogou_pc",
  entries: [...CONFIG_CORE, STATUS_ICONS, PREVIEW_IMAGE, KEYBOARD_BG],
};

/**
 * 其余三出口的过渡画像（provisional）：结构同搜狗 PC。精确的移动布局/音效/多 DPI
 * 位图角色随各出口字段收口（OUT-SG-ANDROID 等）逐个替换，不由本通用画像伪装完成。
 */
export const GENERIC_ASSET_PROFILE: AssetProfileV1 = {
  schemaVersion: 1,
  outlet: "baidu_pc", // 过渡：其余出口经 profileForOutlet 复制并改写 outlet 字段
  entries: [...CONFIG_CORE, STATUS_ICONS, PREVIEW_IMAGE, KEYBOARD_BG],
};

export function profileForOutlet(outlet: Outlet): AssetProfileV1 {
  if (outlet === "sogou_pc") return SOGOU_PC_ASSET_PROFILE;
  return { ...GENERIC_ASSET_PROFILE, outlet };
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isAssetDescriptor(x: unknown): x is AssetDescriptorV1 {
  if (typeof x !== "object" || x === null) return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    ASSET_ROLES.includes(a.role as AssetRole) &&
    typeof a.mediaType === "string" &&
    typeof a.contentHash === "string" &&
    SHA256_HEX.test(a.contentHash) &&
    typeof a.byteLength === "number" &&
    Number.isInteger(a.byteLength) &&
    a.byteLength > 0 &&
    (a.source === "generated" || a.source === "user")
  );
}

export function isAssetProfile(x: unknown): x is AssetProfileV1 {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  if (p.schemaVersion !== 1 || !Array.isArray(p.entries)) return false;
  return p.entries.every(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      ASSET_ROLES.includes((e as Record<string, unknown>).role as AssetRole) &&
      ((e as Record<string, unknown>).carrier === "config" ||
        (e as Record<string, unknown>).carrier === "bitmap") &&
      typeof (e as Record<string, unknown>).required === "boolean",
  );
}
