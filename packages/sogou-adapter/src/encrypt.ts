/**
 * 搜狗 PC `.ssf` 加密容器封装（架构 §2.1 形态②；Node 专属子路径）。
 *
 * 仅在需要产出"与官方皮肤商店同形态"的加密 `.ssf` 时使用；DIY 明文 zip 形态见 `ssf.ts`。
 * 格式（open-reverselab/notes/sogou_ime_skin_format.md，逆向自 ssfconv + 真实样本实测）：
 *   - 文件头 8 字节：magic `"Skin"`（0x536B696E）+ 版本 uint32 = 3。
 *   - 其后为 AES-128-CBC 密文；解密后为 **`[4 字节未压缩大小][zlib 压缩流]`**；密钥/IV 硬编码。
 *   - zlib 解压后：前 4 字节 = offset 表字节数；再后为 offset 表（每文件偏移 uint32）；
 *     随后为文件区，每文件：`[uint32 文件名UTF-16字节数][UTF-16LE 文件名][uint32 内容字节数][内容]`。
 *     （解密后最前 4 字节 = 未压缩大小，与 offset 表无关，见 parseEncryptedSsf。）
 *
 * ⚠️ 本模块 `import node:crypto` / `node:zlib`，**仅限 Node 环境**，勿被浏览器/web-app 引入。
 * 通过 package.json 的单独 exports 子路径暴露，不进主入口。
 */

import crypto from "node:crypto";
import zlib from "node:zlib";

/** AES-256-CBC 密钥与 IV（逆向所得硬编码，官方未公开）。密钥为 32 字节（AES-256）；
 *  头注写作"128"，但逆向 Python 用 32 字节 key + CBC，实为 AES-256-CBC。 */
const AES_KEY = Buffer.from([
  0x52, 0x36, 0x46, 0x1a, 0xd3, 0x85, 0x03, 0x66, 0x90, 0x45, 0x16, 0x28, 0x79, 0x03, 0x36, 0x23,
  0xdd, 0xbe, 0x6f, 0x03, 0xff, 0x04, 0xe3, 0xca, 0xd5, 0x7f, 0xfc, 0xa3, 0x50, 0xe4, 0x9e, 0xd9,
]);
const AES_IV = Buffer.from([
  0xe0, 0x7a, 0xad, 0x35, 0xe0, 0x90, 0xaa, 0x03, 0x8a, 0x51, 0xfd, 0x05, 0xdf, 0x8c, 0x5d, 0x0f,
]);
const MAGIC_SKIN = Buffer.from("Skin", "latin1"); // 文件头魔数字节 'S','k','i','n'（53 6B 69 6E）
const VERSION = 3;

const u32le = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
};
const u32 = (b: Buffer, o: number) => b.readUInt32LE(o);

/** 一个待打包文件：文件名（UTF-8 字符串）+ 内容字节。 */
export interface EncryptFile {
  path: string;
  data: Uint8Array;
}

/** 组装加密 `.ssf` 字节。 */
export function buildEncryptedSsf(files: EncryptFile[]): Uint8Array {
  // 1. 组文件区（offset 表之后；每文件记录：名字节数/名/内容字节数/内容）
  const fileParts: Buffer[] = [];
  let fileRegionLen = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.path, "utf16le"); // UTF-16LE 文件名
    const dataBuf = Buffer.from(f.data);
    fileParts.push(u32le(nameBuf.length), nameBuf, u32le(dataBuf.length), dataBuf);
    fileRegionLen += 4 + nameBuf.length + 4 + dataBuf.length;
  }

  // 2. 明文 data 布局与逆向一致：
  //    data[0:4]=未压缩总大小; data[4:8]=offset表字节数 offsz(=文件数*4);
  //    data[8:8+offsz]=offset 表(每文件绝对偏移 uint32); 之后=文件区。
  const offsz = files.length * 4;
  const offsets: number[] = [];
  let cursor = 8 + offsz; // 文件区起点
  for (let i = 0; i < files.length; i++) {
    offsets.push(cursor);
    const nameLen = Buffer.byteLength(files[i].path, "utf16le");
    cursor += 4 + nameLen + 4 + files[i].data.length;
  }
  const offsetTable = Buffer.concat(offsets.map(u32le));
  const plainData = Buffer.concat([
    u32le(cursor), // 未压缩总大小
    u32le(offsz),
    offsetTable,
    ...fileParts,
  ]);

  // 3. 组 zlib 输入：解密流前 4 字节 = 未压缩大小，其后为 zlib 压缩流
  const compressed = zlib.deflateSync(plainData);
  const payload = Buffer.concat([u32le(plainData.length), compressed]);

  // 4. AES-128-CBC 加密 → 前缀 8 字节头
  const cipher = crypto.createCipheriv("aes-256-cbc", AES_KEY, AES_IV);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);

  const header = Buffer.concat([MAGIC_SKIN, u32le(VERSION)]);
  return Uint8Array.from(Buffer.concat([header, encrypted]));
}

/** 解析加密 `.ssf` 为内部文件列表（与 buildEncryptedSsf 互逆，用于 round-trip 校验）。 */
export function parseEncryptedSsf(ssf: Uint8Array): EncryptFile[] {
  const buf = Buffer.from(ssf);
  if (buf.subarray(0, 4).toString("latin1") !== MAGIC_SKIN.toString("latin1")) throw new Error("不是加密 .ssf：缺少 Skin 魔数");
  if (buf.readUInt32LE(4) !== VERSION) throw new Error(`不支持的 .ssf 版本: ${buf.readUInt32LE(4)}`);

  const decipher = crypto.createDecipheriv("aes-256-cbc", AES_KEY, AES_IV);
  const decrypted = Buffer.concat([decipher.update(buf.subarray(8)), decipher.final()]);

  // 解密流前 4 字节 = 未压缩大小；其后为 zlib 压缩流
  const data = zlib.inflateSync(decrypted.subarray(4));

  const offsz = u32(data, 4); // 文件数 * 4
  const offsets: number[] = [];
  for (let o = 8; o < 8 + offsz; o += 4) offsets.push(u32(data, o));

  const files: EncryptFile[] = [];
  for (const off of offsets) {
    const nl = u32(data, off);
    const name = data.subarray(off + 4, off + 4 + nl).toString("utf16le");
    const cl = u32(data, off + 4 + nl);
    const content = data.subarray(off + 8 + nl, off + 8 + nl + cl);
    files.push({ path: name, data: Uint8Array.from(content) });
  }
  return files;
}