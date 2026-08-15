/**
 * 百度 PC `Skin.xml`（UTF-8 XML，与 skin.ini 等价）—— 兼容旧/新版本加载器（架构 §2.2）。
 * 字段字典见 baidu_ime_skin_format.md（[样本确证]：真实皮肤 纯白 解包）。
 */

import { SKIN_KEYS, nowTimestamp, type SkinIniModel } from "./skin-ini.ts";

/** XML 转义（& < > " '）。 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attr(name: string, value: string): string {
  return `    <${name} value="${esc(value)}" />`;
}

/** 生成 `Skin.xml`（UTF-8 XML，与 skin.ini 等价）。 */
export function emitSkinXml(model: SkinIniModel): string {
  const K = SKIN_KEYS;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" ?>');
  lines.push('<Skin version="1.0">');
  lines.push(attr(K.name, model.name));
  lines.push(attr(K.author, model.author ?? ""));
  lines.push(attr(K.time, model.time ?? nowTimestamp()));
  lines.push(attr(K.email, model.email ?? ""));
  lines.push(attr(K.version, model.version ?? "3.0.0.0"));
  lines.push(attr(K.discrip, model.discrip ?? ""));
  lines.push(attr(K.account, model.account ?? ""));
  lines.push(attr(K.guid, model.guid ?? ""));
  lines.push("</Skin>");
  return lines.join("\r\n") + "\r\n";
}