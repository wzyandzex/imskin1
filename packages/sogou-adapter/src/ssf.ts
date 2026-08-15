/**
 * .ssf 容器组装（架构 §2.1）—— 把 skin.ini 与切图打成搜狗皮肤包。
 *
 * 【已确认事实（open-reverselab 逆向笔记）】.ssf 存在**两种形态**：
 *   ① 未加密：**本质是标准 zip 改后缀**——客户端可安装（DIY 推荐路径）。
 *     本适配器 buildSsf **产出的正是这种未加密 zip 形态**。
 *   ② 加密：AES-128-CBC + zlib + offset 表（头 8 字节 `"Skin"` + ver3，硬编码密钥/IV）。
 *     官方皮肤商店部分产物走此路；本包提供 Node 专属子路径 `@imskin/sogou-adapter/encrypt`
 *     封装加解密（不进浏览器主链路）。
 * 【待真机核实】当前主流搜狗客户端是否**接受手工构建的未加密 zip .ssf** 直接安装
 * （逆向证据强烈支持，但未在本环境真机验证）。
 */

import { zipStore, utf16leEncode, type ZipEntry } from "@imskin/zip";
import { emitSkinIni, type SkinIniModel } from "./skin-ini.ts";

/** 一份搜狗皮肤工程：元信息 + 切图资源 + 结构化 skin.ini 模型。 */
export interface SogouSkinProject {
  id: string;
  name: string;
  /** 切图资源（png/apng 等），path 为容器内文件名。 */
  images: ZipEntry[];
  /** skin.ini 字段模型。 */
  ini: SkinIniModel;
}

/**
 * 组装 .ssf 字节：= zipStore([{ 'skin.ini', ENCODING(emitSkinIni(ini)) }, ...images])。
 * skin.ini 固定置于包内根目录；图片按给定 path 原样纳入。
 *
 * 【编码 — 已确证】skin.ini 为 **UTF-16LE** 编码（open-reverselab 逆向笔记：真实样本逐字节确认，
 * 官方 skin.ini 缺 BOM、UTF-16LE、行尾 \r\n）。本函数以 utf16leEncode 写入。
 * 【容器 — 已确证】明文 .ssf = 标准 zip 改后缀（DIY 推荐路径，客户端可安装）；加密容器见
 * 子路径 `@imskin/sogou-adapter/encrypt`（Node 专属，不进浏览器主链路）。
 */
export function buildSsf(project: SogouSkinProject): Uint8Array {
  const iniText = emitSkinIni(project.ini);
  const entries: ZipEntry[] = [
    { path: "skin.ini", data: utf16leEncode(iniText) },
    ...project.images,
  ];
  return zipStore(entries);
}
