/**
 * 最小 PNG 编码器（RGBA、8bit、非隔行）—— 纯 TS 零依赖。
 *
 * 关键取舍：IDAT 的 deflate 流用 **stored blocks**（BTYPE=00，仅包装不压缩）——
 * 无需压缩器即可产出合法 zlib 流，浏览器/Node 通用（图标 KB 级，体积代价可接受）。
 * zlib 包装：0x78 0x01 + stored deflate + adler32(raw) 大端。
 */

import { crc32 } from "./crc32.ts";

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** stored-block deflate（每块 ≤65535 字节；仅最后一块 BFINAL=1）。 */
function storedDeflate(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(blocks * 5 + data.length);
  let o = 0;
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535;
    const len = Math.min(65535, data.length - start);
    const last = i === blocks - 1 ? 1 : 0;
    out[o++] = last; // BFINAL + BTYPE=00
    out[o++] = len & 0xff;
    out[o++] = (len >> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    out[o++] = nlen & 0xff;
    out[o++] = (nlen >> 8) & 0xff;
    out.set(data.subarray(start, start + len), o);
    o += len;
  }
  return out.subarray(0, o);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

/** RGBA 像素（每行无需 filter 前缀，此处内部补）→ PNG 字节。pixels.length = w*h*4。 */
export function pngEncode(width: number, height: number, pixels: Uint8Array): Uint8Array {
  if (pixels.length !== width * height * 4) throw new Error(`像素长度 ${pixels.length} ≠ ${width}x${height}x4`);

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false);
  dv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // 扫描线：每行 filter byte 0 + RGBA
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const idat = new Uint8Array(2 + 2 + 4 + storedDeflate.length); // 占位长度先算
  const sd = storedDeflate(raw);
  const zlibStream = new Uint8Array(2 + sd.length + 4);
  zlibStream[0] = 0x78;
  zlibStream[1] = 0x01; // CMF/FLG（0x7801 % 31 == 0）
  zlibStream.set(sd, 2);
  const adler = adler32(raw);
  const zdv = new DataView(zlibStream.buffer);
  zdv.setUint32(2 + sd.length, adler, false);
  void idat; // （占位变量不再使用）

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const cIhdr = chunk("IHDR", ihdr);
  const cIdat = chunk("IDAT", zlibStream);
  const cIend = chunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + cIhdr.length + cIdat.length + cIend.length);
  let o = 0;
  out.set(sig, o); o += sig.length;
  out.set(cIhdr, o); o += cIhdr.length;
  out.set(cIdat, o); o += cIdat.length;
  out.set(cIend, o);
  return out;
}
