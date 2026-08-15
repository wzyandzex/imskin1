/**
 * 纯 TS MD5 —— 零依赖、浏览器安全的 MD5 实现。
 *
 * 用途：百度 Android 皮肤包的 `Token.txt`（MD5 校验值，open-reverselab 逆向笔记确证）。
 * 不依赖 node:crypto，保证 web-app（浏览器）经 orchestrator 引用时不被 Vite 打包炸掉。
 *
 * 实现为标准的 MD5（RFC 1321），返回 32 位小写十六进制字符串。
 * 注意：仅用于"包内容一致性校验"这类非安全场景；切勿用于密码/签名等需要抗碰撞的安全用途。
 */

// 每轮移位量（RFC 1321 表）
const S: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

// 每轮 K 常量 = Math.floor(abs(sin(i)) * 2^32)，i 为弧度
const K: number[] = (() => {
  const k: number[] = [];
  for (let i = 0; i < 64; i++) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }
  return k;
})();

/** 把字节数组按小端 32 位字切分（含 endian 折叠）。 */
function toWords(data: Uint8Array): number[] {
  const words: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    const wordIdx = i >>> 2;
    const shift = (i & 3) * 8;
    words[wordIdx] = (words[wordIdx] ?? 0) | ((byte & 0xff) << shift);
  }
  return words;
}

function rol(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/** 计算字节数组的 MD5，返回 32 位小写十六进制。 */
export function md5(data: Uint8Array): string {
  // 补位：末尾补 0x80，再补 0 直到长度 ≡ 56 (mod 64)，最后 8 字节为原始位长度。
  const bitLen = data.length * 8;
  const paddedLen = ((data.length + 8) >> 6 << 6) + 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.length] = 0x80;
  // 原始长度（小端 64 位，取低 32 位已足够大多数场景）
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, bitLen >>> 0, true);
  dv.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const words = toWords(padded);
  for (let off = 0; off < words.length; off += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    const m = words.slice(off, off + 16);

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + K[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rol(f, S[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const dv2 = new DataView(out.buffer);
  dv2.setUint32(0, a0, true);
  dv2.setUint32(4, b0, true);
  dv2.setUint32(8, c0, true);
  dv2.setUint32(12, d0, true);
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}