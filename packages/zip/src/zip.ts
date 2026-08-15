/**
 * store 方式 ZIP（不压缩）的组装与解析 —— 各皮肤适配器容器的底座（.ssf/.bds 等 = zip）。
 *
 * 【已确认事实】搜狗 .ssf、百度 .bds 等皮肤包本质是标准 zip 改后缀；改回 .zip 即可解压查看。
 * 因此只要产出合法 zip 即得到合法容器。这里刻意只用 store（compression=0，即原样存储不压缩）：
 * 皮肤主要是已压缩的 png/apng，再套 deflate 收益极小，而 store 实现简单、round-trip 可字节级
 * 校验，最稳。产物经 Python zipfile.testzip() 独立验证合法。
 *
 * zip 布局（全小端）：
 *   [本地文件头 + 数据] × N  →  [中央目录记录] × N  →  EOCD（目录结束记录）
 * CRC-32 必须正确，否则解压器判定文件损坏。
 */

import { crc32 } from "./crc32.ts";
import { utf8Encode, utf8Decode, concatBytes } from "./bytes.ts";

/** zip 内一个条目：path 为容器内路径（如 "skin.ini"），data 为原始字节。 */
export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

// zip 各结构的签名（PK\x03\x04 等），以小端 32 位整数表示。
const SIG_LOCAL = 0x04034b50; // 本地文件头 PK\x03\x04
const SIG_CENTRAL = 0x02014b50; // 中央目录记录 PK\x01\x02
const SIG_EOCD = 0x06054b50; // 目录结束记录 PK\x05\x06

const METHOD_STORE = 0; // 压缩方式：0 = 不压缩
const VERSION_NEEDED = 20; // 解压所需版本 2.0
const FLAG_UTF8 = 0x0800; // 通用标志位 bit 11：文件名为 UTF-8（支持非 ASCII 路径）
// 固定 DOS 日期 1980-01-01（(year-1980)<<9 | month<<5 | day = 0x0021），时间 0；
// 用固定值保证同一输入产出字节可复现，也避开部分严格解压器对"零日期"的告警。
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

/** 本地文件头（30 字节定长 + 文件名），后面紧跟数据。 */
function localHeader(name: Uint8Array, crc: number, size: number): Uint8Array {
  const h = new Uint8Array(30 + name.length);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, SIG_LOCAL, true);
  dv.setUint16(4, VERSION_NEEDED, true);
  dv.setUint16(6, FLAG_UTF8, true);
  dv.setUint16(8, METHOD_STORE, true);
  dv.setUint16(10, DOS_TIME, true);
  dv.setUint16(12, DOS_DATE, true);
  dv.setUint32(14, crc >>> 0, true);
  dv.setUint32(18, size, true); // 压缩后大小（store 下 == 原始大小）
  dv.setUint32(22, size, true); // 原始大小
  dv.setUint16(26, name.length, true);
  dv.setUint16(28, 0, true); // 额外字段长度
  h.set(name, 30);
  return h;
}

/** 中央目录记录（46 字节定长 + 文件名）。 */
function centralHeader(name: Uint8Array, crc: number, size: number, offset: number): Uint8Array {
  const h = new Uint8Array(46 + name.length);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, SIG_CENTRAL, true);
  dv.setUint16(4, VERSION_NEEDED, true); // 生成版本
  dv.setUint16(6, VERSION_NEEDED, true); // 解压所需版本
  dv.setUint16(8, FLAG_UTF8, true);
  dv.setUint16(10, METHOD_STORE, true);
  dv.setUint16(12, DOS_TIME, true);
  dv.setUint16(14, DOS_DATE, true);
  dv.setUint32(16, crc >>> 0, true);
  dv.setUint32(20, size, true);
  dv.setUint32(24, size, true);
  dv.setUint16(28, name.length, true);
  dv.setUint16(30, 0, true); // 额外字段长度
  dv.setUint16(32, 0, true); // 注释长度
  dv.setUint16(34, 0, true); // 起始磁盘号
  dv.setUint16(36, 0, true); // 内部属性
  dv.setUint32(38, 0, true); // 外部属性
  dv.setUint32(42, offset, true); // 对应本地文件头的偏移
  h.set(name, 46);
  return h;
}

/** 目录结束记录 EOCD（22 字节定长，注释长度为 0）。 */
function eocd(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const h = new Uint8Array(22);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, SIG_EOCD, true);
  dv.setUint16(4, 0, true); // 本磁盘号
  dv.setUint16(6, 0, true); // 中央目录起始磁盘号
  dv.setUint16(8, count, true); // 本磁盘上的记录数
  dv.setUint16(10, count, true); // 记录总数
  dv.setUint32(12, cdSize, true); // 中央目录字节数
  dv.setUint32(16, cdOffset, true); // 中央目录相对文件起点的偏移
  dv.setUint16(20, 0, true); // 注释长度
  return h;
}

/**
 * 以 store 方式（不压缩）打包为合法 zip 字节。
 * 每项：本地文件头 + 数据；末尾集中写中央目录与 EOCD；CRC-32 逐项计算写入。
 * 路径按 UTF-8 编码并置 UTF-8 标志位，可安全承载中文/非 ASCII 路径。
 */
export function zipStore(files: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0; // 当前本地记录相对文件起点的偏移

  for (const f of files) {
    const name = utf8Encode(f.path);
    const crc = crc32(f.data);
    const lh = localHeader(name, crc, f.data.length);
    locals.push(lh, f.data);
    centrals.push(centralHeader(name, crc, f.data.length, offset));
    offset += lh.length + f.data.length;
  }

  const cdOffset = offset; // 所有本地记录之后即为中央目录起点
  let cdSize = 0;
  for (const c of centrals) cdSize += c.length;

  return concatBytes([...locals, ...centrals, eocd(files.length, cdSize, cdOffset)]);
}

/** 从末尾回扫定位 EOCD 签名（兼容尾部可能存在的注释）。 */
function findEocd(dv: DataView, length: number): number {
  if (length < 22) throw new Error("不是合法 zip：长度不足 EOCD");
  // EOCD 最短 22 字节；无注释时签名位于 length-22，有注释则更靠前。
  for (let i = length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) return i;
  }
  throw new Error("不是合法 zip：未找到 EOCD 签名");
}

/**
 * 解析 zip 的中央目录，提取全部 stored（compression=0）条目，用于 round-trip 校验。
 * 以中央目录为权威来源逐条读取，并回到各自本地文件头定位数据起点；顺带校验 CRC-32，
 * 不符则抛错——这样 listZip(zipStore(x)) 能真正保证与 x 字节一致。
 */
export function listZip(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocdPos = findEocd(dv, buf.length);
  const count = dv.getUint16(eocdPos + 10, true);
  let p = dv.getUint32(eocdPos + 16, true); // 中央目录偏移

  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== SIG_CENTRAL) {
      throw new Error(`中央目录第 ${i} 项签名错误`);
    }
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const path = utf8Decode(buf.subarray(p + 46, p + 46 + nameLen));

    if (method !== METHOD_STORE) {
      throw new Error(`条目「${path}」压缩方式为 ${method}，仅支持 stored(0)`);
    }
    if (dv.getUint32(localOff, true) !== SIG_LOCAL) {
      throw new Error(`条目「${path}」本地文件头签名错误`);
    }
    // 数据起点须用本地头自身的名字/额外字段长度定位（可与中央目录不同）。
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.slice(dataStart, dataStart + compSize); // slice 返回独立副本

    if (crc32(data) !== (crc >>> 0)) {
      throw new Error(`条目「${path}」CRC-32 校验失败`);
    }
    out.push({ path, data });

    p += 46 + nameLen + extraLen + commentLen; // 跳到下一条中央目录记录
  }
  return out;
}
