/**
 * 搜狗 Android 主题元数据（phoneTheme.ini / Skin.ini）—— 字段字典 + 生成器（架构 §2.4→Android）。
 *
 * ============================ 诚实边界（务必先读）============================
 * 【已确认事实（open-reverselab/notes/sogou_ime_skin_format.md）】搜狗 Android `.ssf` = **普通 ZIP**
 * （非 PC 的 AES 加密容器）。ZIP 内按主题 ID 分层：`phoneTheme.ini`(必需入口) + `Skin.ini`(旧版备选) +
 * `theme/<布局>/layout/*.ini` + `res/`(亮) + `resblack/`(暗) + `phoneSkin.ini` + `colors.ini` 等。
 * 结构经真实 APK（com.sohu.inputmethod.sogou v20.6.6）jadx 反编译确证，非"逆向猜格式"。
 *
 * 【仍待真机核实】各布局 .ini 的确切键名/取值（keys.ini/candidate.ini 等按主题模板），真机安装验证。
 * ==========================================================================
 */

/** phoneTheme.ini 键（[样本确证]：jadx ThemeListUtil 解析）。 */
export const THEME_KEYS = {
  name: "ThemeName",
  id: "ThemeID",
  version: "ThemeVersion",
  author: "ThemeAuthor",
  description: "ThemeDescription",
  package: "ThemePackage",
} as const;

/** phoneTheme.ini 生成模型。 */
export interface ThemeModel {
  name: string;
  id?: string;
  version?: string;
  author?: string;
  description?: string;
  /** package 名（主题包标识）。 */
  pkg?: string;
}

function sanitizeInline(text: string): string {
  let out = "";
  for (const ch of text) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out;
}

function kv(key: string, value: string): string {
  return `${sanitizeInline(key)}=${sanitizeInline(value)}`;
}

/** 生成 phoneTheme.ini 文本（UTF-8）。 */
export function emitPhoneTheme(model: ThemeModel): string {
  const K = THEME_KEYS;
  const lines: string[] = [];
  lines.push(kv(K.name, model.name));
  lines.push(kv(K.id, model.id ?? ""));
  lines.push(kv(K.version, model.version ?? "1.0"));
  lines.push(kv(K.author, model.author ?? ""));
  lines.push(kv(K.description, model.description ?? ""));
  lines.push(kv(K.package, model.pkg ?? model.id ?? model.name));
  return lines.join("\r\n") + "\r\n";
}

/** 生成旧版入口 Skin.ini（phoneTheme.ini 不存在时的备选）。 */
export function emitSkinIni(model: ThemeModel): string {
  const K = THEME_KEYS;
  const lines: string[] = [];
  lines.push(`[Theme]`);
  lines.push(kv(K.name, model.name));
  lines.push(kv(K.id, model.id ?? ""));
  lines.push(kv(K.version, model.version ?? "1.0"));
  lines.push(kv(K.author, model.author ?? ""));
  return lines.join("\r\n") + "\r\n";
}