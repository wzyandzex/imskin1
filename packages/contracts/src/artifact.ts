/**
 * PackageArtifactV1 —— 出口一次构建的候选包及其元数据（docs/01 §12）。
 *
 * 现状：orchestrator 仍返回裸 Uint8Array（DOM-002 迁移）；本契约先作为
 * 唯一元数据形态被引用，防止各处再造 "bytes+count" 近义结构。
 */

import { isDeliveryLevel, type DeliveryLevel } from "./delivery.ts";
import { isOutlet, OUTLETS, type Outlet } from "./outlet.ts";

/** 各出口包扩展名（唯一权威映射）。 */
export const OUTLET_EXTENSIONS: Record<Outlet, ".ssf" | ".bps" | ".bds"> = {
  sogou_pc: ".ssf",
  sogou_android: ".ssf",
  baidu_pc: ".bps",
  baidu_android: ".bds",
};

export interface PackageArtifactV1 {
  schemaVersion: 1;
  id: string;
  projectId: string;
  versionId: string;
  outlet: Outlet;
  fileName: string;
  extension: string;
  mediaType: "application/octet-stream";
  byteLength: number;
  /** 小写 64 位 hex。 */
  sha256: string;
  buildProfileVersion: string;
  createdAt: string;
  structuralReportId: string;
  qaReportIds: string[];
  deliveryLevel: DeliveryLevel;
  /** 实验包（未过确认门禁/结构骨架）必须为 true（ADR-008）。 */
  experimental: boolean;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isPackageArtifact(x: unknown): x is PackageArtifactV1 {
  if (typeof x !== "object" || x === null) return false;
  const a = x as Record<string, unknown>;
  return (
    a.schemaVersion === 1 &&
    typeof a.id === "string" &&
    typeof a.projectId === "string" &&
    typeof a.versionId === "string" &&
    isOutlet(a.outlet) &&
    typeof a.fileName === "string" &&
    typeof a.extension === "string" &&
    a.mediaType === "application/octet-stream" &&
    typeof a.byteLength === "number" &&
    Number.isInteger(a.byteLength) &&
    a.byteLength >= 0 &&
    typeof a.sha256 === "string" &&
    SHA256_HEX.test(a.sha256) &&
    typeof a.buildProfileVersion === "string" &&
    typeof a.createdAt === "string" &&
    typeof a.structuralReportId === "string" &&
    Array.isArray(a.qaReportIds) &&
    isDeliveryLevel(a.deliveryLevel) &&
    typeof a.experimental === "boolean"
  );
}

/** 文件名与 outlet 扩展名一致性检查（包级校验子集，docs/02 §10）。 */
export function artifactExtensionMatches(a: PackageArtifactV1): boolean {
  return a.fileName.endsWith(OUTLET_EXTENSIONS[a.outlet]) && a.extension === OUTLET_EXTENSIONS[a.outlet];
}

export { OUTLETS };
