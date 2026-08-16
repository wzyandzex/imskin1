/**
 * @imskin/sogou-adapter —— 搜狗 PC 皮肤适配层（架构 §2.1）。
 *
 * 公开面：
 * - 容器：转再导出 @imskin/zip 的 zipStore / listZip / ZipEntry（.ssf = zip 改后缀）
 * - skin.ini：SkinIniModel 及子类型 / INI_KEYS（字段经 ssfconv 逆向确证）/ emitSkinIni
 * - 打包：SogouSkinProject / buildSsf（skin.ini + 切图 → .ssf 字节）
 *
 * 诚实边界：容器机制（zip 改后缀）已确认；skin.ini 字段多经 ssfconv 逆向确证，
 * 少数边缘字段与真机安装待核（详见 skin-ini.ts 诚实边界）。
 */

export { crc32, utf8Encode, utf8Decode, concatBytes, zipStore, listZip, type ZipEntry } from "@imskin/zip";

export {
  emitSkinIni,
  INI_KEYS,
  type SkinIniModel,
  type SkinIniGeneral,
  type DisplayStyle,
  type WindowRegion,
  type StatusBarSpec,
} from "./skin-ini.ts";

export { buildSsf, type SogouSkinProject } from "./ssf.ts";
export { validateSsf, type StructuralReport } from "./validate.ts";
