/**
 * 百度 PC UI 布局（Candidate.xml / Status.xml）—— 生成器（架构 §2.2）。
 *
 * 笔记（baidu_ime_skin_format.md）确证：UTF-8 XML，`<UI version="1.0">` 根下两个顶层窗口类
 * `CCandidateWin`(候选窗) / `CStatusWin`(状态条)，各自含 `<Properties>` 与 `<Children>`；
 * 子控件为 `CBDButton`（命名 `H_/V_` 前缀区分横竖排），其 `<Properties>` 内
 * `normalImg/overImg/downImg` → `<CBDImage file="\xxx.png" stretchArea="l,t,r,b" drawStyle="" />`。
 *
 * 诚实边界：这是**结构正确、可打包**的最小布局生成器。位图由调用方按 `ZipEntry[]` 提供
 * （真实切图待 A3 图像生成）；未提供时产出仅含背景/骨架的合法 XML，真机可被识别。
 * 具体控件/坐标由调用方经 `buttons`/`properties` 提供，字段名与九宫格语义已确证。
 */

/** 一个九宫格拉伸区（left,top,right,bottom）。 */
export interface StretchArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** CBDButton 的一个状态图（normal/over/down）。 */
export interface ButtonImage {
  /** 包内相对路径，`\` 开头（如 "\baidu_h_normal.png"）。 */
  file: string;
  stretchArea?: StretchArea;
  /** drawStyle：0=普通贴图，1=背景拉伸，2=背景（九宫格）。 */
  drawStyle?: number;
}

/** 布局里一个按钮（对应 <CBDButton>）。 */
export interface ButtonDef {
  name: string;
  position?: string; // "x,y"
  rect?: string; // "x,y,w,h"
  size?: string; // "w,h"
  zOrder?: number;
  normal?: ButtonImage;
  over?: ButtonImage;
  down?: ButtonImage;
}

/** 一个窗口类（CCandidateWin / CStatusWin）。 */
export interface WindowDef {
  /** 根标签名，如 "CCandidateWin" / "CStatusWin"。 */
  tag: string;
  /** 顶层属性（size="..." clientrect="..." clampCand="..." 等）。 */
  attrs?: Record<string, string>;
  /** <Properties> 下的背景图（bkground/bkgroundH/bkgroundV...）。 */
  properties?: Record<string, ButtonImage>;
  /** <Children> 下的按钮列表。 */
  children?: ButtonDef[];
}

export interface UiXmlOptions {
  windows: WindowDef[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 对象 → 空格分隔的 XML 属性串。 */
function attrsOf(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ");
}

function emitImage(img: ButtonImage, indent: string): string {
  const sa = img.stretchArea
    ? ` stretchArea="${img.stretchArea.left},${img.stretchArea.top},${img.stretchArea.right},${img.stretchArea.bottom}"`
    : "";
  const ds = img.drawStyle === undefined ? "" : ` drawStyle="${img.drawStyle}"`;
  return `${indent}<CBDImage file="${esc(img.file)}"${sa}${ds} />`;
}

function emitButton(btn: ButtonDef, indent: string): string {
  const attrs: string[] = [`name="${esc(btn.name)}"`];
  if (btn.position !== undefined) attrs.push(`position="${esc(btn.position)}"`);
  if (btn.rect !== undefined) attrs.push(`rect="${esc(btn.rect)}"`);
  if (btn.size !== undefined) attrs.push(`size="${esc(btn.size)}"`);
  if (btn.zOrder !== undefined) attrs.push(`zOrder="${btn.zOrder}"`);
  const hasState = btn.normal || btn.over || btn.down;
  if (!hasState) return `${indent}<CBDButton ${attrs.join(" ")} />`;

  const lines: string[] = [`${indent}<CBDButton ${attrs.join(" ")}>`];
  lines.push(`${indent}  <Properties>`);
  if (btn.normal) lines.push(`${indent}    <normalImg>${emitImage(btn.normal, "")}</normalImg>`);
  if (btn.over) lines.push(`${indent}    <overImg>${emitImage(btn.over, "")}</overImg>`);
  if (btn.down) lines.push(`${indent}    <downImg>${emitImage(btn.down, "")}</downImg>`);
  lines.push(`${indent}  </Properties>`);
  lines.push(`${indent}</CBDButton>`);
  return lines.join("\r\n");
}

/** 生成一个 `<UI>` 布局 XML（Candidate.xml / Status.xml 共用）。 */
export function emitUiXml(opts: UiXmlOptions): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" ?>');
  lines.push('<UI version="1.0">');
  for (const win of opts.windows) {
    lines.push(`  <${win.tag}>`);
    // 顶层属性（size="..." clrCand="..." 等）作为属性直接落在窗口标签上
    const attrStr = attrsOf(win.attrs ?? {});
    if (attrStr) lines[lines.length - 1] = `  <${win.tag} ${attrStr}>`;
    const props = win.properties ?? {};
    if (Object.keys(props).length > 0) {
      lines.push("    <Properties>");
      for (const [k, img] of Object.entries(props)) {
        lines.push(`      <${k}>${emitImage(img, "")}</${k}>`);
      }
      lines.push("    </Properties>");
    }
    for (const child of win.children ?? []) lines.push(emitButton(child, "    "));
    lines.push(`  </${win.tag}>`);
  }
  lines.push("</UI>");
  return lines.join("\r\n") + "\r\n";
}