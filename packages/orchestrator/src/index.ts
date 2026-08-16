/**
 * @imskin/orchestrator —— 智能体编排层：把 A1..A6 用结构化契约串成"生成→迭代→导出"主循环。
 */

// 跨包契约单一来源重导出（DOM-001）：下游从 orchestrator 或 contracts 取 Outlet 均可，
// 但禁止再自定义近义状态串。
export { OUTLETS, OUTLET_EXTENSIONS, outletFromParts, outletFromApiKey, apiKeyFromOutlet, isOutlet } from "@imskin/contracts";
export type { Outlet, Vendor, DeviceClass, OutletApiKey } from "@imskin/contracts";

export { SkinOrchestrator } from "./orchestrator.ts";
export type {
  VersionDesign,
  GenerateResult,
  FeedbackResult,
  ExportResult,
  BaiduExportResult,
  BaiduPcExportResult,
  SogouMobileExportResult,
  OutletExportResult,
} from "./orchestrator.ts";
export { provenance } from "./provenance.ts";
export { skinToSkinIni, type ToSkinIniOptions } from "./toSkinIni.ts";
export { skinToBaiduMobile, type ToBaiduOptions } from "./toBaidu.ts";
export { skinToBaiduPc, type ToBaiduPcOptions } from "./toBaiduPc.ts";
