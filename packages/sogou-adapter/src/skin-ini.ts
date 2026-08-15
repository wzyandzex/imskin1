/**
 * skin.ini 结构化字段模型 + INI 文本生成器（架构 §2.1）。
 *
 * ============================ 诚实边界（务必先读）============================
 * 【已确认事实（§2.1）】搜狗 PC 皮肤 = 一个 skin.ini + 若干 png/apng，打进标准
 * zip 改后缀 .ssf。官方存在"设计-切图-生成"标准流程。
 *
 * 【ssfconv 逆向确证 — 2026-07 联网调研补充】开源解析器 ssfconv（github.com/fkxxyz/ssfconv，
 * 一个能真实读取 .ssf 并转 fcitx 的 Python 工具）的源码逐字暴露了真实字段，已据此重写 INI_KEYS：
 *   节名：[General] [Display] [StatusBar] [Scheme_H1/H2/V1/V2]。
 *   [General]：skin_name / skin_author / skin_version / skin_info。
 *   [Display]：font_size、pinyin_color（拼音串）、zhongwen_first_color（首选/选中）、
 *              zhongwen_color（其余候选）、pinyin_marge / zhongwen_marge（4 值边距）、separator。
 *   [Scheme_*]：pic / pinyin_pic / zhongwen_pic、layout_horizontal / layout_vertical
 *              （"mode,a,b"，mode 0=拉伸，即九宫格拉伸区）。
 *   **颜色编码 = BGR 十六进制整数**（见 formatColor）。**无字体族键、无独立候选序号/背景色键**。
 * 这修正了此前发明/摘要级的错误键名（如把颜色放进不存在的 [Candidate] 段、原样输出 RGB）。
 *
 * 【仍待核实（§11.2）】ssfconv 只读它转换所需的键（未读≠不存在），故仍可能有未建模字段
 * （如候选序号色、apng 帧率、版本兼容标记）；边距 marge 的 4 值确切语义、按键状态图全集，
 * 以及 §11.2 的"数十样本频率统计"权威字典，仍待真实样本/真机。未覆盖字段可经 extraSections 承载。
 *
 * 【编码风险】另有 Linux 移植记录称 skin.ini 为 UTF-16(LF)；本适配器以 UTF-8 写入
 * （见 ssf.ts）。且 .ssf 存在加密/未加密两种形态，本适配器产出未加密 zip 形态（见 ssf.ts）。
 * 均待真机确认。
 * ==========================================================================
 */

// 九宫格拉伸边距沿用 skin-gen 的 NineSlice 契约（同一架构概念，避免二次定义）。
// 类型仅在编译期存在、运行时被剥离，跨包 import 不产生运行时依赖。
import type { NineSlice } from "@imskin/skin-gen";

/**
 * skin.ini 的节名 / 键名 / 取值编码映射（不确定项的唯一收口处）。
 *
 * 置信度分级：
 *   [ssfconv确证] = 逆向自开源解析器 ssfconv（真实读取 .ssf 的 Python，github.com/fkxxyz/ssfconv），
 *                   键名/编码可信度高（ssfconv 能实读则该键真实存在）；
 *   [教程确证]    = 官方 Flash 皮肤教程多源印证；
 *   [样本确证]    = tiny-reverselab 用真实搜狗 PC 皮肤样本（简约彩虹/苍翠欲滴/鹿晗运动季/小白熊）
 *                   解包统计归纳（open-reverselab/notes/sogou_ime_skin_format.md）；
 *   [PROVISIONAL] = 以上均未覆盖、仍待更多样本/真机核实（未读≠不存在）。
 * 取样本后改这一处即可；请勿在别处硬编码键名。
 */
export const INI_KEYS = {
  /**
   * [General] 段：皮肤元信息。[ssfconv确证] 键名 skin_name/skin_version/skin_author/skin_info；
   * [样本确证] 补充 skin_id/preview_square/class/class_id/tag/preview_comp/skin_email/skin_time。
   */
  general: {
    section: "General",
    name: "skin_name", // [ssfconv确证]
    author: "skin_author", // [ssfconv确证]
    version: "skin_version", // [ssfconv确证]
    info: "skin_info", // [ssfconv确证]
    id: "skin_id", // [样本确证]
    previewSquare: "preview_square", // [样本确证] 皮肤列表方图
    previewComp: "preview_comp", // [样本确证] 合成预览图 comp_<id>.png
    class: "class", // [样本确证] 皮肤风格
    classId: "class_id", // [样本确证] 风格 ID
    tag: "tag", // [样本确证] 标签 ID|标签名,...
    email: "skin_email", // [样本确证]
    time: "skin_time", // [样本确证] "yyyy.MM.dd"
  },
  /**
   * [Display] 段：字号与三处文字颜色 + 边距 + 分隔线 + 字体族。[ssfconv确证] 核心颜色/字号/边距；
   * [样本确证] 补充字体族与渲染开关。
   *   font_size=字号(整数 px)；pinyin_color=拼音串色；zhongwen_first_color=首选/选中候选色；
   *   zhongwen_color=其余候选色；pinyin_marge/zhongwen_marge=4 值逗号边距；separator=分隔线开关。
   *   font_ch/font_en=中/英文字体族；comphint_color=云候选/提示色；use_gdip/aero/glow/LargeFontSupport=渲染开关。
   * 【颜色编码 = BGR 十六进制整数】（ssfconv: int(hex); r=%256,g=//256%256,b=//65536），
   * 故 #RRGGBB 写盘须重排为 BBGGRR，见 formatColor。**注意：无独立候选序号色/背景色键**
   * （背景由 Scheme 段的 pic 图承担；序号色 ssfconv 未读、[样本确证] 样本亦未出现，[PROVISIONAL]）。
   */
  display: {
    section: "Display",
    fontSize: "font_size", // [ssfconv确证]
    pinyinColor: "pinyin_color", // [ssfconv确证] 拼音串
    firstColor: "zhongwen_first_color", // [ssfconv确证] 首选/选中候选
    candColor: "zhongwen_color", // [ssfconv确证] 其余候选
    pinyinMargin: "pinyin_marge", // [ssfconv确证] 4 值逗号(注意官方拼写 marge)
    zhongwenMargin: "zhongwen_marge", // [ssfconv确证]
    separator: "separator", // [ssfconv确证] 真值即开
    fontCh: "font_ch", // [样本确证] 中文字体族
    fontEn: "font_en", // [样本确证] 英文字体族
    compHintColor: "comphint_color", // [样本确证] 云候选/提示色
    useGdip: "use_gdip", // [样本确证] 渲染开关
    aero: "aero", // [样本确证]
    glow: "glow", // [样本确证]
    largeFontSupport: "LargeFontSupport", // [样本确证]
  },
  /**
   * 输入窗口方案。[教程确证+ssfconv确证] 四种节名：Scheme_H1=横排合、Scheme_H2=横排分、
   * Scheme_V1=竖排合、Scheme_V2=竖排分。[ssfconv确证] 段内键：
   *   pic=窗口背景图、pinyin_pic/zhongwen_pic=拼音串/候选背景图（[样本确证] 分窗口方案
   *   Scheme_H2 用 pinyin_pic=../zhongwen_pic=.. 分别承载拼音串与候选区背景）；
   *   layout_horizontal="mode,left,right"、layout_vertical="mode,top,bottom"（3 值；[0]=模式，
   *   0 为拉伸；[1][2]=拉伸边距）——即九宫格拉伸区就落在这两个键里。
   *   [样本确证] 另有 custom0/custom_cnt 等自定义装饰（值形如 oh_custom01.png）。
   */
  scheme: {
    h1: "Scheme_H1",
    h2: "Scheme_H2",
    v1: "Scheme_V1",
    v2: "Scheme_V2",
    pic: "pic", // [ssfconv确证]
    pinyinPic: "pinyin_pic", // [样本确证] 分窗口拼音串背景
    zhongwenPic: "zhongwen_pic", // [样本确证] 分窗口候选背景
    layoutHorizontal: "layout_horizontal", // [ssfconv确证] "mode,left,right"
    layoutVertical: "layout_vertical", // [ssfconv确证] "mode,top,bottom"
    customCount: "custom_cnt", // [样本确证] 自定义装饰数量
    // 自定义装饰键 custom0/custom1/... 由调用方经 extraSections 或此处拼接（见 emitWindow）
  },
  /**
   * [StatusBar] 工具栏。[ssfconv确证] 按钮状态图经 `按钮名+"_display"` 与 `按钮名+"_pos"` 读取，
   * 鼠标态如 softkeyboard_down/in/out/downing；[样本确证] 完整按钮集：cn_en/quan_ban/biaodian/
   * fan_jian/softkeyboard/quan_shuang/menu/sogousearch/passport/skinmanager，
   * 每按钮通用键 `<btn>_display`、`<btn>_pos`、`<btn>`、`<btn>_down`、`<btn>_hover`。
   * pic=状态栏背景。[教程确证] 另有 flash_cnt/flash0_pos/flash0_cursor（Flash 状态栏）。
   */
  statusBar: {
    section: "StatusBar",
    pic: "pic", // [ssfconv确证]
    displaySuffix: "_display", // [ssfconv确证] 按钮名+后缀
    posSuffix: "_pos", // [ssfconv确证]
    downSuffix: "_down", // [样本确证] 按下态
    hoverSuffix: "_hover", // [样本确证] 悬停态
    flashCount: "flash_cnt", // [教程确证]
    flash0Pos: "flash0_pos", // [教程确证]
    flash0Cursor: "flash0_cursor", // [教程确证]
  },
  /** [样本确证] 状态栏可配置按钮名集合（见 emitStatusBarButton）。 */
  buttons: [
    "cn_en", "quan_ban", "biaodian", "fan_jian", "softkeyboard",
    "quan_shuang", "menu", "sogousearch", "passport", "skinmanager",
  ] as const,
} as const;

/** [General] 段：皮肤元信息。[ssfconv确证] 键名 skin_name/skin_author/skin_version/skin_info；[样本确证] 补充其余。 */
export interface SkinIniGeneral {
  /** 皮肤显示名（必填，写入 skin_name）。 */
  name: string;
  /** skin_author。 */
  author?: string;
  /** skin_version。 */
  version?: string;
  /** skin_info（皮肤描述/简介）。 */
  info?: string;
  /* —— 以下均 [样本确证]，可选 —— */
  /** skin_id（皮肤 ID）。 */
  id?: string;
  /** preview_square：皮肤列表方图文件名。 */
  previewSquare?: string;
  /** preview_comp：合成预览图 comp_<id>.png。 */
  previewComp?: string;
  /** class：皮肤风格。 */
  class?: string;
  /** class_id：风格 ID。 */
  classId?: string;
  /** tag：标签（"ID|标签名,..."）。 */
  tag?: string;
  /** skin_email。 */
  email?: string;
  /** skin_time：制作时间 "yyyy.MM.dd"。 */
  time?: string;
}

/**
 * [Display] 段：字号与三处文字颜色（+ 边距/分隔线/字体族/渲染开关）。[ssfconv确证] 核心；
 * [样本确证] 补充字体族与开关。
 * 颜色以 #RRGGBB 建模（与 skin-gen 一致）；写盘由 formatColor 重排为搜狗的 BGR 十六进制。
 * 注意（ssfconv 事实）：无字体族键、无独立序号色/背景色键——背景由 Scheme 段 pic 图承担。
 */
export interface DisplayStyle {
  /** 字号（整数 px，写入 font_size）。 */
  fontSize: number;
  /** 拼音串颜色（pinyin_color）。 */
  pinyinColor: string;
  /** 首选/选中候选颜色（zhongwen_first_color）。 */
  firstColor: string;
  /** 其余候选颜色（zhongwen_color）。 */
  candColor: string;
  /** 拼音串边距 4 值（pinyin_marge，语义待细核，原样写出）。 */
  pinyinMargin?: [number, number, number, number];
  /** 候选边距 4 值（zhongwen_marge）。 */
  zhongwenMargin?: [number, number, number, number];
  /** 分隔线开关（separator，真值即开）。 */
  separator?: boolean;
  /* —— 以下均 [样本确证]，可选 —— */
  /** 中文字体族（font_ch）。 */
  fontCh?: string;
  /** 英文字体族（font_en）。 */
  fontEn?: string;
  /** 云候选/提示色（comphint_color，BGR）。 */
  compHintColor?: string;
  /** 渲染开关（use_gdip/aero/glow/LargeFontSupport），真值即开。 */
  useGdip?: boolean;
  aero?: boolean;
  glow?: boolean;
  largeFontSupport?: boolean;
}

/**
 * 输入窗口背景九宫格：一张背景图 + 上右下左不拉伸边距（四角保形）。
 * [ssfconv确证] 写盘为 pic + layout_horizontal="0,left,right" + layout_vertical="0,top,bottom"。
 * [样本确证] 分窗口方案（Scheme_H2/V2）可分别用 pinyinPic/zhongwenPic 承载拼音串与候选区背景；
 * custom0N 为自定义装饰图（customN_align 对齐语义待核，原样写出）。
 */
export interface WindowRegion extends NineSlice {
  /** 背景图在容器内的文件名（写入 pic，如 "bg_h.png"）。 */
  image: string;
  /** [样本确证] 分窗口拼音串背景图（写入 pinyin_pic）。 */
  pinyinPic?: string;
  /** [样本确证] 分窗口候选背景图（写入 zhongwen_pic）。 */
  zhongwenPic?: string;
  /** [样本确证] 自定义装饰图（custom0/custom1/...，下标即键名序号）。 */
  custom?: { image: string; align?: string }[];
}

/**
 * [StatusBar] 工具栏。[ssfconv确证] 通用键：`<btn>_display`/`<btn>_pos`；[样本确证] 补 `<btn>`/`_down`/`_hover`。
 * pic 为状态栏背景图文件名。flash* 为 [教程确证] Flash 状态栏。
 */
export interface StatusBarSpec {
  pic?: string;
  flashCount?: number;
  flash0Pos?: string;
  flash0Cursor?: number;
  /** [样本确证] 每个按钮的状态图与位置。按钮名见 INI_KEYS.buttons。 */
  buttons?: StatusBarButtonSpec[];
}

/** 状态栏一个按钮：`<btn>_display/_pos/<btn>/<btn>_down/<btn>_hover`。 */
export interface StatusBarButtonSpec {
  /** 按钮名（如 "cn_en"、"softkeyboard"），见 INI_KEYS.buttons。 */
  name: string;
  /** 是否显示（<btn>_display，真值即开）。 */
  display?: boolean;
  /** 位置（<btn>_pos，如 "42,18"）。 */
  pos?: string;
  /** 常态图集（<btn>，逗号分隔多态，如 "cn1.png,en1.png,a1.png"）。 */
  images?: string;
  /** 按下态图集（<btn>_down）。 */
  downImages?: string;
  /** 悬停态图集（<btn>_hover）。 */
  hoverImages?: string;
}

/** 结构化 skin.ini 模型：键名/编码见 INI_KEYS（置信度分级见其注释）。 */
export interface SkinIniModel {
  general: SkinIniGeneral;
  /** [Display] 段：字号 + 三处文字颜色（+ 边距/分隔线）。 */
  display: DisplayStyle;
  /** 横排合窗口（[Scheme_H1]）背景九宫格。 */
  horizontalWindow?: WindowRegion;
  /** 竖排合窗口（[Scheme_V1]）背景九宫格。 */
  verticalWindow?: WindowRegion;
  /** 工具栏（[StatusBar]）。 */
  statusBar?: StatusBarSpec;
  /**
   * 逃生舱：尚未建模的自定义节区（如分窗口 Scheme_H2/V2、按键状态图等），键值原样写出。
   * 在补齐字段的过渡期，可用它承载未纳入结构的已知字段，无需改本模型即可产出更完整的 skin.ini。
   */
  extraSections?: { section: string; entries: Record<string, string | number> }[];
}

/**
 * 颜色写盘编码：搜狗 skin.ini 用 **BGR 十六进制整数**（[ssfconv确证]：int(hex) 后
 * r=%256、g=//256%256、b=//65536，即最低字节是 R、最高是 B）。故把 #RRGGBB 重排为 BBGGRR。
 */
function formatColor(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex; // 非法输入原样返回（上游应保证 #RRGGBB）
  const rr = m[1].slice(0, 2);
  const gg = m[1].slice(2, 4);
  const bb = m[1].slice(4, 6);
  return `${bb}${gg}${rr}`.toLowerCase();
}

// ── INI 文本组装（小工具：分号注释、[节]、key=value；行尾用 Windows 惯例 CRLF）──

/**
 * 行内净化：INI 是逐行 key=value 结构，值/键/节名一旦混入回车换行（CR/LF）等控制字符，
 * 就会撑破单行、甚至凭空注入伪节区——例如皮肤名带 "\r\n[X]\r\nk=v" 会多出一个独立 [X] 段。
 * 这里把所有 C0 控制字符（U+0000..U+001F，含 \r \n \t）统一替换为空格，保证每个字段恒为单行、
 * 产物结构始终合法（非法输入不再污染整份 skin.ini）。
 * 注意：这是防御性净化，**不是**搜狗特有的转义规则——真机对特殊字符的转义/编码语义属
 * §11.2 PROVISIONAL；若核实后需保留原字符（如带转义序列），只在此处调整即可。
 */
function sanitizeInline(text: string): string {
  // 逐字符扫描：把码点小于 0x20 的 C0 控制字符（回车、换行、制表符等）替换为空格，
  // 其余字符原样保留；不在源码里内嵌任何控制字节，保证源文件为干净可读的 ASCII。
  let out = "";
  for (const ch of text) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out;
}

function pushComment(lines: string[], text: string): void {
  lines.push(`; ${sanitizeInline(text)}`);
}

function pushSection(lines: string[], name: string): void {
  if (lines.length > 0) lines.push(""); // 段间空行，便于阅读
  lines.push(`[${sanitizeInline(name)}]`);
}

function pushKv(lines: string[], key: string, value: string | number): void {
  lines.push(`${sanitizeInline(key)}=${sanitizeInline(String(value))}`);
}

/** 可选值：仅当有值时才写出该键。 */
function pushKvOpt(lines: string[], key: string, value: string | number | undefined): void {
  if (value !== undefined) pushKv(lines, key, value);
}

/** 写出一个九宫格窗口段（[ssfconv确证]：pic + layout_horizontal/vertical，[0]=模式 0 拉伸）。 */
function emitWindow(lines: string[], section: string, region: WindowRegion): void {
  const K = INI_KEYS.scheme;
  pushSection(lines, section);
  pushKv(lines, K.pic, region.image);
  // layout_horizontal="0,left,right"（模式 0=拉伸）、layout_vertical="0,top,bottom"
  pushKv(lines, K.layoutHorizontal, `0,${region.left},${region.right}`);
  pushKv(lines, K.layoutVertical, `0,${region.top},${region.bottom}`);
  // [样本确证] 分窗口拼音串/候选背景；自定义装饰 custom0/custom1/...
  pushKvOpt(lines, K.pinyinPic, region.pinyinPic);
  pushKvOpt(lines, K.zhongwenPic, region.zhongwenPic);
  (region.custom ?? []).forEach((c, i) => {
    pushKv(lines, `custom${i}`, c.image);
    if (c.align !== undefined) pushKv(lines, `custom${i}_align`, c.align);
  });
  if (region.custom && region.custom.length > 0) pushKv(lines, K.customCount, region.custom.length);
}

/** [样本确证] 写出状态栏一个按钮（`<btn>_display/_pos/<btn>/_down/_hover`）。 */
function emitStatusBarButton(lines: string[], btn: StatusBarButtonSpec): void {
  const K = INI_KEYS.statusBar;
  const name = sanitizeInline(btn.name);
  pushKvOpt(lines, `${name}${K.displaySuffix}`, btn.display === undefined ? undefined : (btn.display ? 1 : 0));
  pushKvOpt(lines, `${name}${K.posSuffix}`, btn.pos);
  pushKvOpt(lines, name, btn.images);
  pushKvOpt(lines, `${name}${K.downSuffix}`, btn.downImages);
  pushKvOpt(lines, `${name}${K.hoverSuffix}`, btn.hoverImages);
}

/**
 * 序列化 SkinIniModel 为 skin.ini 文本（CRLF 行尾，尾部带换行）。
 * 键名/编码大多为 [ssfconv确证]（逆向自开源解析器），少数 [教程确证]/[PROVISIONAL]，见 INI_KEYS。
 */
export function emitSkinIni(model: SkinIniModel): string {
  const K = INI_KEYS;
  const lines: string[] = [];

  pushComment(lines, "由 @imskin/sogou-adapter 生成（skin.ini）");
  pushComment(lines, "字段多经 ssfconv 逆向确证；颜色为 BGR 十六进制。个别未覆盖项待真机核实（§11.2）");

  // [General]
  pushSection(lines, K.general.section);
  pushKv(lines, K.general.name, model.general.name);
  pushKvOpt(lines, K.general.author, model.general.author);
  pushKvOpt(lines, K.general.version, model.general.version);
  pushKvOpt(lines, K.general.info, model.general.info);
  // [样本确证] 补充元信息
  const g = model.general;
  pushKvOpt(lines, K.general.id, g.id);
  pushKvOpt(lines, K.general.previewSquare, g.previewSquare);
  pushKvOpt(lines, K.general.previewComp, g.previewComp);
  pushKvOpt(lines, K.general.class, g.class);
  pushKvOpt(lines, K.general.classId, g.classId);
  pushKvOpt(lines, K.general.tag, g.tag);
  pushKvOpt(lines, K.general.email, g.email);
  pushKvOpt(lines, K.general.time, g.time);

  // [Display]：字号 + 三处文字颜色（BGR）+ 边距/分隔线 + [样本确证] 字体族/渲染开关
  const d = model.display;
  pushSection(lines, K.display.section);
  pushKv(lines, K.display.fontSize, d.fontSize);
  pushKv(lines, K.display.pinyinColor, formatColor(d.pinyinColor));
  pushKv(lines, K.display.firstColor, formatColor(d.firstColor));
  pushKv(lines, K.display.candColor, formatColor(d.candColor));
  if (d.pinyinMargin) pushKv(lines, K.display.pinyinMargin, d.pinyinMargin.join(","));
  if (d.zhongwenMargin) pushKv(lines, K.display.zhongwenMargin, d.zhongwenMargin.join(","));
  if (d.separator !== undefined) pushKv(lines, K.display.separator, d.separator ? 1 : 0);
  pushKvOpt(lines, K.display.fontCh, d.fontCh);
  pushKvOpt(lines, K.display.fontEn, d.fontEn);
  if (d.compHintColor) pushKv(lines, K.display.compHintColor, formatColor(d.compHintColor));
  if (d.useGdip !== undefined) pushKv(lines, K.display.useGdip, d.useGdip ? 1 : 0);
  if (d.aero !== undefined) pushKv(lines, K.display.aero, d.aero ? 1 : 0);
  if (d.glow !== undefined) pushKv(lines, K.display.glow, d.glow ? 1 : 0);
  if (d.largeFontSupport !== undefined) pushKv(lines, K.display.largeFontSupport, d.largeFontSupport ? 1 : 0);

  // 九宫格拉伸区（横排合 Scheme_H1 / 竖排合 Scheme_V1）
  if (model.horizontalWindow) emitWindow(lines, K.scheme.h1, model.horizontalWindow);
  if (model.verticalWindow) emitWindow(lines, K.scheme.v1, model.verticalWindow);

  // 工具栏 [StatusBar]
  if (model.statusBar) {
    const sb = model.statusBar;
    pushSection(lines, K.statusBar.section);
    pushKvOpt(lines, K.statusBar.pic, sb.pic);
    pushKvOpt(lines, K.statusBar.flashCount, sb.flashCount);
    pushKvOpt(lines, K.statusBar.flash0Pos, sb.flash0Pos);
    pushKvOpt(lines, K.statusBar.flash0Cursor, sb.flash0Cursor);
    for (const btn of sb.buttons ?? []) emitStatusBarButton(lines, btn);
  }

  // 逃生舱：自定义节区（分窗口 Scheme_H2/V2、按键状态图等）
  for (const s of model.extraSections ?? []) {
    pushSection(lines, s.section);
    for (const [key, value] of Object.entries(s.entries)) pushKv(lines, key, value);
  }

  return lines.join("\r\n") + "\r\n";
}
