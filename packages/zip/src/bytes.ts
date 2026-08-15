/**
 * 字节工具（纯函数）—— zip 组装与文本编码共用的地基。
 *
 * 皮肤容器（.ssf/.bds 等）是标准 zip，内部一律按字节处理：路径与文本用 UTF-8，
 * 图片等资源本就是二进制。这里集中收口编码/解码/拼接，避免各处重复实现。
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

/** 字符串 → UTF-8 字节。 */
export function utf8Encode(s: string): Uint8Array {
  return encoder.encode(s);
}

/** UTF-8 字节 → 字符串。 */
export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/**
 * 字符串 → UTF-16LE 字节（无 BOM）。
 *
 * 搜狗 PC / 百度 PC 的 skin.ini 均为 UTF-16LE 编码（open-reverselab 逆向笔记确证）。
 * 浏览器/Node 的 TextEncoder 只支持 utf-8，无法直接产出 utf-16le，故在此自实现（纯二进制，零依赖）。
 * 码点 ≤ 0xFFFF 直接写为单 UTF-16 单元（小端）；> 0xFFFF 的代理对拆成高低两个单元。
 */
export function utf16leEncode(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2); // 每字符至少 2 字节；代理对会多占 2 字节，先用最大估
  let pos = 0;
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // 合法代理对：合成 Unicode 码点
        const cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        const hi = 0xd800 + Math.floor((cp - 0x10000) / 0x400);
        const lo = 0xdc00 + ((cp - 0x10000) % 0x400);
        out[pos++] = hi & 0xff;
        out[pos++] = (hi >> 8) & 0xff;
        out[pos++] = lo & 0xff;
        out[pos++] = (lo >> 8) & 0xff;
        i++; // 跳过低代理
        continue;
      }
    }
    // 普通单元（含孤立代理，原样写）
    out[pos++] = code & 0xff;
    out[pos++] = (code >> 8) & 0xff;
  }
  return out.subarray(0, pos);
}

/** 顺序拼接多段字节为一整块（zip 由「本地记录…中央目录…EOCD」拼成）。 */
export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
