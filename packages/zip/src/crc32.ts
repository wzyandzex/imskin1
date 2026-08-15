/**
 * CRC-32（IEEE 802.3，多项式 0xEDB88320 的反射算法）—— zip 每个条目的校验字段。
 *
 * zip 的 local file header 与 central directory 都要写入数据的 CRC-32；写错会让
 * 解压器报"文件损坏"。这里用标准查找表实现，与 zip/gzip/PNG 使用的是同一 CRC。
 * 已知向量：crc32("")=0x00000000，crc32("123456789")=0xCBF43926。
 */

/** CRC-32 查找表：多项式 0xEDB88320，惰性构建一次后复用。 */
let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  table = t;
  return t;
}

/** 计算字节序列的 CRC-32，返回无符号 32 位整数（0 ≤ 值 ≤ 0xFFFFFFFF）。 */
export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ t[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
