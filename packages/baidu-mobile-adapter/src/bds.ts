/**
 * 百度 Android `.bds` 容器组装（架构 §2.5→Android）—— 把 Info/Token/布局/样式/素材打成皮肤包。
 *
 * 【已确认事实（baidu_ime_skin_format_android.md）】`.bds` = 外层标准 ZIP（与 PC 相同）；
 * 内部文件结构完全不同：`Info.txt` + `Token.txt` + `preview.png` + `port/`+`land/` 布局 .ini/.cnd
 * + `css.ini` + 可选 `keyshape`/`diy/config.json`。用 store 方式 zip（客户端 ZipLoader deflate 解压，
 * store 同样可解），浏览器可安全生成。
 *
 * 【命名 — PROVISIONAL】笔记称 DIY 产物命名为 `<主题名>+MD5(包内容32hex)+".bds"`；本函数产出包字节，
 * 命名由调用方决定（见 orchestrator）。
 */

import { zipStore, utf8Encode, md5, type ZipEntry } from "@imskin/zip";
import { emitInfo, emitToken, type InfoModel } from "./info.ts";
import { emitCssIni, type CssIni } from "./layout.ts";

/** 一份百度 Android 皮肤工程。 */
export interface BaiduMobileProject {
  id: string;
  name: string;
  /** Info.txt 元数据。 */
  info: InfoModel;
  /** 竖屏布局（port/ 下若干 .ini/.cnd/.pop）。 */
  port?: { path: string; content: string }[];
  /** 横屏布局（land/ 下）。 */
  land?: { path: string; content: string }[];
  /** css.ini 皮肤样式。 */
  css?: CssIni;
  /** 复用一次生成的 Info.txt 字节计算 Token（[PROVISIONAL] 输入语义，见 info.ts）。 */
  tokenSeed?: string;
  /** Keyshape（键位形状）索引 JSON。 */
  keyshapeJson?: string;
  /** 素材资源（png 等），path 为容器内路径。 */
  images?: ZipEntry[];
  /** 预览图（preview.png）。 */
  preview?: Uint8Array;
}

/** 组装 `.bds` 字节。 */
export function buildBds(project: BaiduMobileProject): Uint8Array {
  const infoText = emitInfo(project.info);
  // Token.txt：以 Info.txt 文本字节的 MD5 作结构性占位（[PROVISIONAL]）
  const token = emitToken(md5(utf8Encode(infoText)));

  const entries: ZipEntry[] = [
    { path: "Info.txt", data: utf8Encode(infoText) },
    { path: "Token.txt", data: utf8Encode(token) },
  ];
  for (const f of project.port ?? []) entries.push({ path: `port/${f.path}`, data: utf8Encode(f.content) });
  for (const f of project.land ?? []) entries.push({ path: `land/${f.path}`, data: utf8Encode(f.content) });
  if (project.css) entries.push({ path: "css.ini", data: utf8Encode(emitCssIni(project.css)) });
  if (project.keyshapeJson) entries.push({ path: "keyshape.json", data: utf8Encode(project.keyshapeJson) });
  if (project.preview) entries.push({ path: "preview.png", data: project.preview });
  entries.push(...(project.images ?? []));
  return zipStore(entries);
}