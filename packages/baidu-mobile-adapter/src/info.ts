/**
 * 百度 Android 皮肤元数据（Info.txt / Token.txt）—— 字段字典 + 生成器（架构 §2.5→Android）。
 *
 * ============================ 诚实边界（务必先读）============================
 * 【已确认事实（open-reverselab/notes/baidu_ime_skin_format_android.md）】手机端 `.bds` =
 * 标准 ZIP 容器（外层与 PC 相同），内部结构完全不同：`Info.txt`(UTF-8) + `Token.txt`(MD5) +
 * `preview.png` + `port/`+`land/` 布局 .ini + `css.ini` 样式 + 可选 `keyshape`/`diy/config.json`。
 * 字段经真实 APK（com.baidu.input v13.3.6.113）jadx 反编译确证，非"逆向猜格式"。
 *
 * 【仍待真机核实】Token.txt 的 MD5 输入语义（DiyUtils 组装时对"哪部分字节"算 MD5 未完全还原，
 * [PROVISIONAL]）；当前主流版本接受的后缀（.bds vs 有保护 .bps）与是否需登录校验。
 * ==========================================================================
 */

/** Info.txt 键字典（[样本确证]：ThemeInfo.a0 解析 + DiyUtils.b 生成）。 */
export const INFO_KEYS = {
  name: "Name",
  style: "Style",
  description: "Description",
  supportPlatform: "SupportPlatform",
  minImeCode: "MinImeCode",
  versionCode: "VersionCode",
  diyType: "DiyType",
  author: "Author",
  vipType: "VipType",
  // 普通主题解析键（theme 体系）
  skinType: "SkinType",
  themeType: "ThemeType",
  abilities: "Abilities",
  skinFlags: "SkinFlags",
  supportPatch: "SupportPatch",
  supportExtendedLayout: "SupportExtendedLayout",
} as const;

/** DIY 类型：2=Text 文字、3=Ditto 图片、Common=0。 */
export const DIY_TYPE = { common: 0, text: 2, ditto: 3 } as const;
/** VIP 类型：0/1/2/3。 */
export const VIP_TYPE = { none: 0, vip1: 1, vip2: 2, vip3: 3 } as const;

/** Info.txt 生成模型。 */
export interface InfoModel {
  name: string;
  author?: string;
  description?: string;
  /** DIY 类型（缺省 text）。 */
  diyType?: number;
  versionCode?: number;
  vipType?: number;
  supportPlatform?: string;
  minImeCode?: number;
}

/** 生成 Info.txt 文本（UTF-8；DIY 皮肤生成时实际写入的键子集）。 */
export function emitInfo(model: InfoModel): string {
  const K = INFO_KEYS;
  const lines: string[] = [];
  const kv = (k: string, v: string | number) => lines.push(`${k}=${v}`);
  kv(K.name, model.name);
  kv(K.style, "default");
  kv(K.description, model.description ?? "");
  kv(K.supportPlatform, model.supportPlatform ?? "A"); // A=Android
  kv(K.minImeCode, model.minImeCode ?? 3);
  kv(K.versionCode, model.versionCode ?? 16);
  kv(K.diyType, model.diyType ?? DIY_TYPE.text);
  kv(K.author, model.author ?? "");
  kv(K.vipType, model.vipType ?? VIP_TYPE.none);
  return lines.join("\r\n") + "\r\n";
}

/**
 * 生成 Token.txt（MD5 校验值）。
 * [PROVISIONAL]：MD5 的输入语义（对包内容/Info.txt 的哪部分字节）未完全还原，此处以
 * `Info.txt` 文本字节的 MD5 作为结构性占位，真机核实后只需改本函数输入。
 */
export function emitToken(metaMd5: string): string {
  return metaMd5 + "\r\n";
}