/**
 * @imskin/baidu-pc-adapter —— 百度 PC 皮肤适配层（架构 §2.2）。
 *
 * 公开面：`.bps` 打包（buildBps）+ skin.ini(UTF-16)/Skin.xml/Candidate.xml/Status.xml 生成器。
 * 字段经 open-reverselab 逆向笔记（真实皮肤解包）确证，非"逆向猜格式"。
 * 诚实边界：位图由调用方提供（A3 图像生成未接入）；真机安装验证待核。
 */

export { SKIN_KEYS, emitSkinIni, nowTimestamp, randomGuid, type SkinIniModel } from "./skin-ini.ts";
export { emitSkinXml } from "./skin-xml.ts";
export {
  emitUiXml,
  type UiXmlOptions,
  type WindowDef,
  type ButtonDef,
  type ButtonImage,
  type StretchArea,
} from "./ui-xml.ts";
export { buildBps, type BaiduPcProject } from "./bps.ts";export { validateBps, type StructuralReport } from "./validate.ts";
