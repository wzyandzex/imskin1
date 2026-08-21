/**
 * 搜狗 Android .ssf 结构校验器（OUT-SG-ANDROID）。
 *
 * 必需入口：phoneTheme.ini（APK 逆向确证）。
 * 检查：ZIP 可解析 / phoneTheme.ini 存在且可按 UTF-8 解码 / 路径安全。
 */

import { validateZipStructure, checkRequiredEntries, checkDecodable, finalizeReport } from "@imskin/zip";
import type { StructuralReport } from "@imskin/zip";
export type { StructuralReport };

export function validateSogouMobileSsf(bytes: Uint8Array): StructuralReport {
  const base = validateZipStructure(bytes);
  if (!base) return { ok: false, issues: ["zip 解析失败"], entries: [] };

  const report: StructuralReport = { ...base, issues: [...base.issues] };
  checkRequiredEntries(report, ["phoneTheme.ini"]);
  const text = checkDecodable(report, bytes, "phoneTheme.ini", "utf-8");
  // phoneTheme.ini 是 key=value 属性文件（非 INI 节格式），检查 ThemeName 键存在
  if (text && !text.includes("ThemeName=")) {
    report.issues.push("phoneTheme.ini 缺少 ThemeName 键");
  }
  return finalizeReport(report);
}
