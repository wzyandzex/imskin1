/**
 * 百度 Android .bds 结构校验器（OUT-BAIDU-ANDROID）。
 *
 * 必需入口：Info.txt（UTF-8）+ Token.txt + css.ini。真实 APK 逆向确证。
 * 检查：ZIP / Info.txt 可解码且含 Name 键 / Token.txt 非空。
 */

import { validateZipStructure, checkRequiredEntries, checkDecodable, checkContains, finalizeReport } from "@imskin/zip";
import type { StructuralReport } from "@imskin/zip";
export type { StructuralReport };

export function validateBds(bytes: Uint8Array): StructuralReport {
  const base = validateZipStructure(bytes);
  if (!base) return { ok: false, issues: ["zip 解析失败"], entries: [] };

  const report: StructuralReport = { ...base, issues: [...base.issues] };
  checkRequiredEntries(report, ["Info.txt", "Token.txt", "css.ini"]);

  const info = checkDecodable(report, bytes, "Info.txt", "utf-8");
  checkContains(report, info, "Info.txt", ["Name="]);

  // Token.txt 应为 MD5（32 位 hex 或可读校验值）——非空即可（语义待 R-03 核实）
  const token = checkDecodable(report, bytes, "Token.txt", "utf-8");
  if (token !== null && token.trim().length === 0) {
    report.issues.push("Token.txt 为空（应有校验值）");
  }
  return finalizeReport(report);
}
