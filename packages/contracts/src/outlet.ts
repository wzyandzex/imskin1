/**
 * Outlet —— 厂商 × 设备 的四出口唯一标识（docs/01 §3.1）。
 *
 * 领域内部只允许使用本文件的枚举值；REST/文件名等边界形态用 OUTLET_API_KEYS /
 * OUTLET_EXTENSIONS 做显式转换，不允许各包自造近义字符串（如 sogouPc / sogou-pc / mobile）。
 */

import type { ParseResult } from "./parse.ts";

export type Vendor = "sogou" | "baidu";
export type DeviceClass = "pc" | "android";

/** 四出口：搜狗PC / 搜狗Android / 百度PC / 百度Android（iOS 无外部导入通道，不在枚举内）。 */
export type Outlet = `${Vendor}_${DeviceClass}`;

export const VENDORS: readonly Vendor[] = ["sogou", "baidu"];
export const DEVICE_CLASSES: readonly DeviceClass[] = ["pc", "android"];

export const OUTLETS: readonly Outlet[] = [
  "sogou_pc",
  "sogou_android",
  "baidu_pc",
  "baidu_android",
];

/** REST API 的出口键（camelCase，兼容既有端点；仅边界层使用）。 */
export type OutletApiKey = "sogouPc" | "sogouMobile" | "baiduPc" | "baiduMobile";

export const OUTLET_API_KEYS: Record<Outlet, OutletApiKey> = {
  sogou_pc: "sogouPc",
  sogou_android: "sogouMobile",
  baidu_pc: "baiduPc",
  baidu_android: "baiduMobile",
};

const API_KEY_TO_OUTLET: Record<OutletApiKey, Outlet> = {
  sogouPc: "sogou_pc",
  sogouMobile: "sogou_android",
  baiduPc: "baidu_pc",
  baiduMobile: "baidu_android",
};

export function isOutlet(x: unknown): x is Outlet {
  return typeof x === "string" && (OUTLETS as readonly string[]).includes(x);
}

export function outletVendor(o: Outlet): Vendor {
  return o.split("_")[0] as Vendor;
}

export function outletDeviceClass(o: Outlet): DeviceClass {
  return o.split("_")[1] as DeviceClass;
}

/** 由厂商+设备组合出 Outlet；成员非法时返回 null（不抛）。 */
export function outletFromParts(vendor: unknown, device: unknown): Outlet | null {
  if (
    !(VENDORS as readonly unknown[]).includes(vendor) ||
    !(DEVICE_CLASSES as readonly unknown[]).includes(device)
  ) {
    return null;
  }
  return `${vendor}_${device}` as Outlet;
}

export function parseOutlet(x: unknown): ParseResult<Outlet> {
  if (typeof x !== "string") {
    return { ok: false, issues: [`outlet 必须是字符串，收到 ${typeof x}`] };
  }
  if (isOutlet(x)) return { ok: true, value: x };
  // 常见近义错误给可操作提示
  const api = Object.entries(API_KEY_TO_OUTLET).find(([k]) => k === x);
  if (api) {
    return { ok: false, issues: [`outlet "${x}" 是 API 键名，领域值应为 "${api[1]}"（或用 outletFromApiKey 转换）`] };
  }
  const legacy = x.replace(/-/g, "_");
  if (legacy.includes("mobile")) {
    return { ok: false, issues: [`outlet "${x}" 含 mobile；领域枚举用 android（iOS 无导入通道，docs/01 §3.1）`] };
  }
  if (isOutlet(legacy)) {
    return { ok: false, issues: [`outlet "${x}" 应写作 "${legacy}"（下划线分隔）`] };
  }
  return { ok: false, issues: [`outlet "${x}" 不在 ${OUTLETS.join(" / ")} 中`] };
}

export function isOutletApiKey(x: unknown): x is OutletApiKey {
  return typeof x === "string" && x in API_KEY_TO_OUTLET;
}

/** API 键名 → 领域 Outlet（边界转换，仅在 api/web 传输层使用）。 */
export function outletFromApiKey(x: unknown): Outlet | null {
  return isOutletApiKey(x) ? API_KEY_TO_OUTLET[x] : null;
}

export function apiKeyFromOutlet(o: Outlet): OutletApiKey {
  return OUTLET_API_KEYS[o];
}
