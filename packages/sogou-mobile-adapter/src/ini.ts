/**
 * INI 文本组装工具（共享）—— 同 baidu-mobile 的防御性净化，杜绝换行注入伪节区。
 */

/** 把码点 <0x20 的 C0 控制字符替换为空格。 */
export function sanitizeInline(text: string): string {
  let out = "";
  for (const ch of text) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out;
}

export function pushSection(lines: string[], name: string): void {
  if (lines.length > 0) lines.push("");
  lines.push(`[${sanitizeInline(name)}]`);
}

export function pushKv(lines: string[], key: string, value: string | number): void {
  lines.push(`${sanitizeInline(key)}=${sanitizeInline(String(value))}`);
}