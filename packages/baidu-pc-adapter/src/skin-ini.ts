/**
 * 百度 PC 皮肤元数据（skin.ini，UTF-16LE）—— 字段字典 + 生成器（架构 §2.2）。
 *
 * ============================ 诚实边界（务必先读）============================
 * 【已确认事实（open-reverselab/notes/baidu_ime_skin_format.md）】百度 PC `.bps` = 一个
 * **无注释、纯 deflate 的标准 ZIP**，内部含 `skin.ini`(UTF-16LE) + `Skin.xml`(UTF-8 XML) +
 * `Candidate.ini/xml` + `Status.ini/xml` + 若干位图。无加密、无私有头、无魔数校验。
 * 本适配器据此**可编程直生**（推翻此前"驱动官方编辑器"方案，见架构 §2.2 更新）。
 *
 * 【仍待真机核实】手写 zip 是否被当前主流百度输入法接受安装（逆向证据：skininst.exe 仅 zlib
 * 解压、无自定义解密，强烈支持；但未在本环境真机验证）。
 * ==========================================================================
 */

/** `[Skin]` 段元数据键字典（[样本确证]：真实皮肤 纯白/标题/四叶 解包统计）。 */
export const SKIN_KEYS = {
  section: "Skin",
  uversion: "uversion", // 1.0 皮肤文件版本
  email: "email", // 作者邮箱
  name: "name", // 皮肤名
  discrip: "discrip", // 描述
  time: "time", // yyyyMMddHHmmssfff（17 位）
  guid: "guid", // 皮肤唯一 ID，同时用作安装目录名
  account: "account", // 站点账号名
  author: "author", // 作者名
  iniver: "iniver", // 1.0 ini 版本
  version: "version", // 3.0.0.0 皮肤格式版本
} as const;

/** `[Skin]` 段元数据模型。 */
export interface SkinIniModel {
  name: string;
  author?: string;
  email?: string;
  discrip?: string;
  /** 皮肤 GUID（缺省则调用方生成；用作安装目录名）。 */
  guid?: string;
  /** 制作时间 yyyyMMddHHmmssfff（缺省则用当前时间）。 */
  time?: string;
  account?: string;
  /** skin 格式版本（缺省 "3.0.0.0"）。 */
  version?: string;
  /** iniver（缺省 "1.0"）。 */
  iniver?: string;
  /** uversion（缺省 "1.0"）。 */
  uversion?: string;
}

function sanitizeInline(text: string): string {
  let out = "";
  for (const ch of text) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out;
}

function pushKv(lines: string[], key: string, value: string): void {
  lines.push(`${sanitizeInline(key)}=${sanitizeInline(value)}`);
}

/** 生成 `[Skin]` 元数据文本（UTF-16LE 由打包层编码；此处为字符串）。 */
export function emitSkinIni(model: SkinIniModel): string {
  const K = SKIN_KEYS;
  const lines: string[] = [];
  lines.push(`[${K.section}]`);
  pushKv(lines, K.uversion, model.uversion ?? "1.0");
  pushKv(lines, K.email, model.email ?? "");
  pushKv(lines, K.name, model.name);
  pushKv(lines, K.discrip, model.discrip ?? "");
  pushKv(lines, K.time, model.time ?? nowTimestamp());
  pushKv(lines, K.guid, model.guid ?? "");
  pushKv(lines, K.account, model.account ?? "");
  pushKv(lines, K.author, model.author ?? "");
  pushKv(lines, K.iniver, model.iniver ?? "1.0");
  pushKv(lines, K.version, model.version ?? "3.0.0.0");
  return lines.join("\r\n") + "\r\n";
}

/** 当前时间戳 yyyyMMddHHmmssfff（17 位，与样本一致）。 */
export function nowTimestamp(d: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
  );
}

/** 生成一个随机的 RFC4122 v4 GUID（皮肤唯一 ID）。 */
export function randomGuid(): string {
  const rnd = new Uint8Array(16);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(rnd);
  } else {
    for (let i = 0; i < 16; i++) rnd[i] = Math.floor(Math.random() * 256);
  }
  rnd[6] = (rnd[6] & 0x0f) | 0x40; // version 4
  rnd[8] = (rnd[8] & 0x3f) | 0x80; // variant
  const hex = [...rnd].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    .toUpperCase();
}