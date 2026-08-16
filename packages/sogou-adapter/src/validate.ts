/**
 * 搜狗 .ssf 结构校验器（OUT-SGPC-001，docs/02 §10 包级通用校验 / docs/03 G4）。
 *
 * 程序化回答"这个包结构上像不像一个 .ssf"：zip 可解析、入口存在、UTF-16LE 可解码、
 * 关键节存在、路径安全、无重复条目。它**不证明**客户端可安装（那需 E4 真机证据，
 * docs/05 §6）——通过只把出口抬到 structural 等级的"结构"子集。
 */

import { listZip } from "@imskin/zip";

export interface StructuralReport {
  ok: boolean;
  issues: string[];
  entries: string[];
}

const REQUIRED_ENTRY = "skin.ini";
const REQUIRED_SECTIONS = ["[General]", "[Display]"];

function decodeUtf16Le(bytes: Uint8Array): string {
  return new TextDecoder("utf-16le").decode(bytes);
}

export function validateSsf(bytes: Uint8Array): StructuralReport {
  const issues: string[] = [];
  let entries: string[] = [];

  try {
    const list = listZip(bytes); // 解析过程校验 CRC（篡改即抛）
    entries = list.map((e) => e.path);
  } catch (e) {
    return { ok: false, issues: [`zip 解析失败（CRC/结构）：${e instanceof Error ? e.message : String(e)}`], entries: [] };
  }

  if (entries.length === 0) issues.push("zip 为空（无任何条目）");

  // 路径安全与重复条目
  const seen = new Set<string>();
  for (const p of entries) {
    if (p.includes("\0")) issues.push(`路径含 NUL：${p}`);
    const segs = p.split(/[\\/]/);
    if (segs.includes("..") || segs.includes(".")) issues.push(`路径含相对段：${p}`);
    if (seen.has(p)) issues.push(`重复条目：${p}`);
    seen.add(p);
  }

  // 必需入口 + 编码 + 关键节
  const ini = listZip(bytes).find((e) => e.path === REQUIRED_ENTRY);
  if (!ini) {
    issues.push(`缺少必需入口 ${REQUIRED_ENTRY}`);
  } else {
    let text = "";
    try {
      text = decodeUtf16Le(ini.data);
    } catch (e) {
      issues.push(`skin.ini UTF-16LE 解码失败：${e instanceof Error ? e.message : String(e)}`);
    }
    for (const sec of REQUIRED_SECTIONS) {
      if (text && !text.includes(sec)) issues.push(`skin.ini 缺关键节 ${sec}`);
    }
  }

  return { ok: issues.length === 0, issues, entries };
}
