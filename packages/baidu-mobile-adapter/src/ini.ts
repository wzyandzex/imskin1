/**
 * INI 文本组装工具（共享）—— 与 sogou/baidu-pc 同源的防御性净化：
 * 值/键/节名内的 C0 控制字符（含 CR/LF）统一替换为空格，杜绝换行撑破单行或凭空注入伪节区。
 */

/** 把码点 <0x20 的 C0 控制字符（回车/换行/制表符等）替换为空格；源码不内嵌控制字节。 */
export function sanitizeInline(text: string): string {
  let out = "";
  for (const ch of text) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out;
}

export function pushSection(lines: string[], name: string): void {
  if (lines.length > 0) lines.push("");
  lines.push(`[${sanitizeInline(name)}]`);
}

/** 键=值（无缩进，UTF-8 文本用）。 */
export function pushKv(lines: string[], key: string, value: string | number): void {
  lines.push(`${sanitizeInline(key)}=${sanitizeInline(String(value))}`);
}

/** 可选值：仅当有值时写出。 */
export function pushKvOpt(lines: string[], key: string, value: string | number | undefined): void {
  if (value !== undefined) pushKv(lines, key, value);
}