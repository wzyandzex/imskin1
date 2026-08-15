/**
 * @imskin/contracts —— 跨包领域契约的单一导出位置（DOM-001）。
 *
 * 规则（docs/01 §1/§17）：
 * - 领域内部只用本包的枚举/类型；边界（REST/文件名）用显式转换函数；
 * - 所有公开契约提供运行时 parser/guard，禁止裸 as 断言跨越信任边界；
 * - 零第三方依赖。
 */

export type { ParseResult } from "./parse.ts";
export {
  VENDORS,
  DEVICE_CLASSES,
  OUTLETS,
  OUTLET_API_KEYS,
  isOutlet,
  outletVendor,
  outletDeviceClass,
  outletFromParts,
  parseOutlet,
  isOutletApiKey,
  outletFromApiKey,
  apiKeyFromOutlet,
} from "./outlet.ts";
export type { Vendor, DeviceClass, Outlet, OutletApiKey } from "./outlet.ts";

export {
  DELIVERY_ORDER,
  isDeliveryLevel,
  parseDeliveryLevel,
  isAtLeast,
  isInstallable,
} from "./delivery.ts";
export type { DeliveryLevel } from "./delivery.ts";

export { DIAGNOSTIC_CODES, isDiagnostic } from "./diagnostic.ts";
export type { Diagnostic, DiagnosticCode, Severity } from "./diagnostic.ts";

export { OUTLET_EXTENSIONS, isPackageArtifact, artifactExtensionMatches } from "./artifact.ts";
export type { PackageArtifactV1 } from "./artifact.ts";

export {
  FEEDBACK_CATEGORIES,
  CHANGE_OPERATIONS,
  LOW_CONFIDENCE_THRESHOLD,
  isChangeInstruction,
  instructionOutletsValid,
  needsTargetConfirmation,
} from "./change.ts";
export type {
  FeedbackCategory,
  ChangeOperation,
  ChangeInstructionV1,
} from "./change.ts";
