/**
 * 百度 PC .bps 结构校验器（OUT-BAIDU-PC）。
 *
 * 必需入口：skin.ini（UTF-16LE）+ Skin.xml（UTF-8）。真实皮肤解包确证。
 * 检查：ZIP / skin.ini UTF-16LE 解码含 [Skin] / Skin.xml 含 <?xml 或 <skin。
 */

import { validateZipStructure, checkRequiredEntries, checkDecodable, checkContains, finalizeReport } from "@imskin/zip";
import type { StructuralReport } from "@imskin/zip";
export type { StructuralReport };

export function validateBps(bytes: Uint8Array): StructuralReport {
  const base = validateZipStructure(bytes);
  if (!base) return { ok: false, issues: ["zip 解析失败"], entries: [] };

  const report: StructuralReport = { ...base, issues: [...base.issues] };
  checkRequiredEntries(report, ["skin.ini", "Skin.xml"]);

  const ini = checkDecodable(report, bytes, "skin.ini", "utf-16le");
  checkContains(report, ini, "skin.ini", ["[Skin]"]);

  const xml = checkDecodable(report, bytes, "Skin.xml", "utf-8");
  if (xml) {
    const hasXml = xml.includes("<?xml") || xml.includes("<Skin") || xml.includes("<skin");
    if (!hasXml) {
      report.issues.push("Skin.xml 不含 XML 声明或根元素");
    }
  }
  return finalizeReport(report);
}
