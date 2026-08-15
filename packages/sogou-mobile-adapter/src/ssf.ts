/**
 * 搜狗 Android `.ssf` 容器组装（架构 §2.4→Android）—— 普通 ZIP（非 PC 的 AES 加密容器）。
 *
 * 【已确认事实（sogou_ime_skin_format.md）】Android 端 `.ssf` 直接是普通 ZIP
 * （java.util.zip.ZipInputStream 读取）。内部按主题分层：phoneTheme.ini + theme/<布局>/layout/*.ini
 * + res/ + resblack/ + 可选 phoneSkin.ini/colors.ini。用 store 方式 zip，浏览器可安全生成。
 */

import { zipStore, utf8Encode, type ZipEntry } from "@imskin/zip";
import { emitPhoneTheme, emitSkinIni, type ThemeModel } from "./theme.ts";
import { emitLayoutIni, emitColorsIni, type LayoutIni } from "./layout.ts";

/** 一份搜狗 Android 皮肤主题工程。 */
export interface SogouMobileProject {
  id: string;
  name: string;
  /** phoneTheme.ini 元数据。 */
  theme: ThemeModel;
  /** 各布局目录下的布局 .ini（path 形如 "default/layout/candidate.ini"）。 */
  layouts?: { path: string; content: LayoutIni }[];
  /** 配色 colors.ini。 */
  colors?: Record<string, Record<string, string | number>>;
  /** 亮色资源图（res/）。 */
  res?: ZipEntry[];
  /** 暗色资源图（resblack/）。 */
  resblack?: ZipEntry[];
  /** 额外文件（如 phoneSkin.ini / 自定义 .ini）。 */
  extra?: ZipEntry[];
}

/** 组装 `.ssf` 字节。 */
export function buildSsf(project: SogouMobileProject): Uint8Array {
  const entries: ZipEntry[] = [
    { path: "phoneTheme.ini", data: utf8Encode(emitPhoneTheme(project.theme)) },
    { path: "Skin.ini", data: utf8Encode(emitSkinIni(project.theme)) }, // 旧版备选入口
  ];
  for (const l of project.layouts ?? []) {
    entries.push({ path: `theme/${l.path}`, data: utf8Encode(emitLayoutIni(l.content)) });
  }
  if (project.colors) entries.push({ path: "colors.ini", data: utf8Encode(emitColorsIni(project.colors)) });
  for (const r of project.res ?? []) entries.push({ path: `res/${r.path}`, data: r.data });
  for (const r of project.resblack ?? []) entries.push({ path: `resblack/${r.path}`, data: r.data });
  entries.push(...(project.extra ?? []));
  return zipStore(entries);
}