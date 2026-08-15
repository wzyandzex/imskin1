/**
 * 百度 PC `.bps` 容器组装（架构 §2.2）—— 把元数据 + XML 布局 + 位图打成皮肤包。
 *
 * 【已确认事实（baidu_ime_skin_format.md）】`.bps` = 标准 ZIP（deflate）。本适配器用
 * `@imskin/zip` 的 **store 方式**（compression=0）打包——客户端仅 zlib 解压、不校验压缩方式，
 * store 条目同样可解，故产物合法且浏览器可安全生成（无 deflate 依赖）。
 * 【PROVISIONAL】若真机对"必须是 deflate"有硬性要求，仅需在打包层换成 deflate（收口点）。
 *
 * 必备文件：skin.ini(UTF-16) + Skin.xml(UTF-8) + Candidate.xml + Status.xml + 位图 + skinpreview.png。
 */

import { zipStore, utf16leEncode, utf8Encode, type ZipEntry } from "@imskin/zip";
import { emitSkinIni, randomGuid, type SkinIniModel } from "./skin-ini.ts";
import { emitSkinXml } from "./skin-xml.ts";
import { emitUiXml, type UiXmlOptions } from "./ui-xml.ts";

/** 一份百度 PC 皮肤工程。 */
export interface BaiduPcProject {
  id: string;
  name: string;
  /** [Skin] 元数据（guid 缺省则自动生成）。 */
  meta: SkinIniModel;
  /** Candidate.xml 布局；缺省产出空候选窗骨架。 */
  candidate?: UiXmlOptions;
  /** Status.xml 布局；缺省产出空状态条骨架。 */
  status?: UiXmlOptions;
  /** 位图资源（png/gif），path 为容器内路径（`\` 开头或相对）。 */
  images?: ZipEntry[];
  /** 预览图（skinpreview.png），缺省不写。 */
  preview?: Uint8Array;
}

/** 组装 `.bps` 字节。 */
export function buildBps(project: BaiduPcProject): Uint8Array {
  const meta = { ...project.meta, guid: project.meta.guid ?? randomGuid() };
  const entries: ZipEntry[] = [
    { path: "skin.ini", data: utf16leEncode(emitSkinIni(meta)) },
    { path: "Skin.xml", data: utf8Encode(emitSkinXml(meta)) },
    { path: "Candidate.xml", data: utf8Encode(emitUiXml(project.candidate ?? { windows: [] })) },
    { path: "Status.xml", data: utf8Encode(emitUiXml(project.status ?? { windows: [] })) },
  ];
  if (project.preview) entries.push({ path: "skinpreview.png", data: project.preview });
  entries.push(...(project.images ?? []));
  return zipStore(entries);
}