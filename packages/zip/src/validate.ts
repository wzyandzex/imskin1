/**
 * ZIP 结构校验共享工具（OUT-SG-ANDROID / OUT-BAIDU-PC / OUT-BAIDU-ANDROID）。
 *
 * 各出口适配器复用此层的通用检查（ZIP 可解析、路径安全、无重复条目），
 * 再叠加各自的必需文件/编码/结构检查。
 */

import { listZip } from "./zip.ts";

export interface StructuralReport {
  ok: boolean;
  issues: string[];
  entries: string[];
}

/** 通用 ZIP 结构检查（不含出口特有规则）；返回 null 表示 ZIP 本身即非法。 */
export function validateZipStructure(bytes: Uint8Array): StructuralReport | null {
  const issues: string[] = [];
  let entries: string[] = [];

  try {
    entries = listZip(bytes).map((e) => e.path); // 解析过程校验 CRC
  } catch (e) {
    return { ok: false, issues: [`zip 解析失败（CRC/结构）：${e instanceof Error ? e.message : String(e)}`], entries: [] };
  }

  if (entries.length === 0) issues.push("zip 为空（无任何条目）");

  const seen = new Set<string>();
  for (const p of entries) {
    if (p.includes("\0")) issues.push(`路径含 NUL：${p}`);
    const segs = p.split(/[\\/]/);
    if (segs.includes("..") || segs.includes(".")) issues.push(`路径含相对段：${p}`);
    if (seen.has(p)) issues.push(`重复条目：${p}`);
    seen.add(p);
  }

  return { ok: issues.length === 0, issues, entries };
}

/** 检查必需条目是否存在。 */
export function checkRequiredEntries(report: StructuralReport, required: string[]): void {
  for (const req of required) {
    if (!report.entries.includes(req)) {
      report.issues.push(`缺少必需入口 ${req}`);
      report.ok = false;
    }
  }
}

/** 检查条目内容可按指定编码解码。 */
export function checkDecodable(
  report: StructuralReport,
  bytes: Uint8Array,
  entryName: string,
  encoding: "utf-8" | "utf-16le",
): string | null {
  const entry = listZip(bytes).find((e) => e.path === entryName);
  if (!entry) return null;
  try {
    return new TextDecoder(encoding).decode(entry.data);
  } catch (e) {
    report.issues.push(`${entryName} ${encoding} 解码失败：${e instanceof Error ? e.message : String(e)}`);
    report.ok = false;
    return null;
  }
}

/** 检查文本包含必需子串（如 INI 节名或 XML 声明）。 */
export function checkContains(report: StructuralReport, text: string | null, label: string, substrings: string[]): void {
  if (!text) return;
  for (const s of substrings) {
    if (!text.includes(s)) {
      report.issues.push(`${label} 缺少必需内容「${s}」`);
      report.ok = false;
    }
  }
}

/** 标记完成（聚合后统一设 ok）。 */
export function finalizeReport(report: StructuralReport): StructuralReport {
  report.ok = report.issues.length === 0;
  return report;
}
