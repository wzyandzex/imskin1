import { test } from "node:test";
import assert from "node:assert/strict";

import { emitSkinIni, INI_KEYS, type SkinIniModel } from "../src/skin-ini.ts";

/** 一个较完整的样例模型（字段名多经 ssfconv 逆向确证）。 */
function sampleModel(): SkinIniModel {
  return {
    general: {
      name: "青花瓷",
      author: "IMSkin",
      version: "1.0",
      info: "国潮水墨风",
    },
    display: {
      fontSize: 14,
      pinyinColor: "#333333",
      firstColor: "#1a73e8",
      candColor: "#222222",
    },
    horizontalWindow: { image: "bg_h.png", top: 6, right: 6, bottom: 6, left: 6 },
    verticalWindow: { image: "bg_v.png", top: 8, right: 8, bottom: 8, left: 8 },
  };
}

test("emitSkinIni 输出含 ssfconv 确证的段名与键", () => {
  const out = emitSkinIni(sampleModel());
  assert.ok(out.includes("[General]"));
  assert.ok(out.includes("[Display]")); // 颜色/字号在 [Display]，非 [Candidate]
  assert.ok(out.includes(`[${INI_KEYS.scheme.h1}]`));
  assert.ok(out.includes(`[${INI_KEYS.scheme.v1}]`));
  // 真实键名（ssfconv 确证）
  assert.ok(out.includes("skin_name=青花瓷"));
  assert.ok(out.includes("skin_author=IMSkin"));
  assert.ok(out.includes("font_size=14"));
});

test("颜色写盘为 BGR 十六进制（ssfconv 确证的编码）", () => {
  const out = emitSkinIni(sampleModel());
  // #1a73e8 (R=1a G=73 B=e8) → BGR = e8731a
  assert.ok(out.includes("zhongwen_first_color=e8731a"), out);
  // #333333 对称，BGR 仍 333333
  assert.ok(out.includes("pinyin_color=333333"));
  // #222222 → 222222
  assert.ok(out.includes("zhongwen_color=222222"));
});

test("emitSkinIni 文件头带诚实标注（确证来源 + 待核实说明）", () => {
  const out = emitSkinIni(sampleModel());
  assert.match(out, /ssfconv/); // 标注确证来源
  assert.match(out, /核实/); // 仍有待核实项
  assert.ok(out.startsWith(";")); // 以 INI 分号注释开头
});

test("窗口节名为确证的 Scheme_H1/V1，拉伸区落在 layout_horizontal/vertical", () => {
  assert.equal(INI_KEYS.scheme.h1, "Scheme_H1");
  assert.equal(INI_KEYS.scheme.v1, "Scheme_V1");
  const out = emitSkinIni(sampleModel());
  assert.ok(out.includes("[Scheme_H1]"));
  assert.ok(out.includes("pic=bg_h.png"));
  // layout_horizontal="0,left,right"、layout_vertical="0,top,bottom"（H 段用横排的 left/right）
  assert.ok(out.includes("layout_horizontal=0,6,6"));
  assert.ok(out.includes("layout_vertical=0,6,6"));
});

test("[StatusBar] 工具栏段：教程确证键 pic/flash_cnt/flash0_pos/flash0_cursor", () => {
  const model = sampleModel();
  model.statusBar = { pic: "status.png", flashCount: 1, flash0Pos: "0,0", flash0Cursor: 2 };
  const out = emitSkinIni(model);
  assert.ok(out.includes("[StatusBar]"));
  assert.ok(out.includes("pic=status.png"));
  assert.ok(out.includes("flash_cnt=1"));
  assert.ok(out.includes("flash0_pos=0,0"));
  assert.ok(out.includes("flash0_cursor=2"));
});

test("Display 三处文字颜色全部写出（BGR）", () => {
  const out = emitSkinIni(sampleModel());
  assert.ok(out.includes("pinyin_color=333333"));
  assert.ok(out.includes("zhongwen_first_color=e8731a"));
  assert.ok(out.includes("zhongwen_color=222222"));
});

test("可选字段：给了才出现，未给不出现", () => {
  const minimal: SkinIniModel = {
    general: { name: "极简" },
    display: { fontSize: 12, pinyinColor: "#000000", firstColor: "#ff0000", candColor: "#111111" },
  };
  const out = emitSkinIni(minimal);
  assert.ok(out.includes("skin_name=极简"));
  assert.ok(!out.includes("skin_author=")); // 未提供 author
  assert.ok(!out.includes("[Scheme_H1]")); // 未提供九宫格
  assert.ok(!out.includes("[StatusBar]")); // 未提供状态栏
});

test("九宫格拉伸区：横/竖两段的 pic 与 layout 元组", () => {
  const out = emitSkinIni(sampleModel());
  assert.ok(out.includes("pic=bg_h.png"));
  assert.ok(out.includes("pic=bg_v.png"));
  // H 段 left/right=6 → layout_horizontal=0,6,6；V 段 top/bottom=8 → layout_vertical=0,8,8
  assert.ok(out.includes("layout_horizontal=0,8,8")); // 竖排合窗口段的横向拉伸(其 left/right=8)
  assert.ok(out.includes("layout_vertical=0,8,8"));
});

test("extraSections 逃生舱：自定义节区原样写出（如分窗口 Scheme_H2）", () => {
  const model = sampleModel();
  model.extraSections = [{ section: "Scheme_H2", entries: { pic: "split_h.png", FrameRate: 30 } }];
  const out = emitSkinIni(model);
  assert.ok(out.includes("[Scheme_H2]"));
  assert.ok(out.includes("pic=split_h.png"));
  assert.ok(out.includes("FrameRate=30"));
});

test("非法输入净化：值/节名内的 CR/LF 不得撑破结构或注入伪节区", () => {
  // 皮肤名里塞入换行 + 伪节区，试图注入一个独立的 [Injected] 段。
  const out = emitSkinIni({
    general: { name: "evil\r\n[Injected]\r\nHacked=1", info: "多\n行\r描述" },
    display: { fontSize: 12, pinyinColor: "#000000", firstColor: "#ff0000", candColor: "#111111" },
  });
  const lines = out.split("\r\n");
  // 注入内容不得成为独立的节区行 / 键值行
  assert.ok(!lines.includes("[Injected]"), "换行不得把注入内容变成独立节区行");
  assert.ok(!lines.includes("Hacked=1"), "换行不得把注入内容变成独立键值行");
  // 皮肤名整体仍作为单行 skin_name 值写出（控制字符被替换为空格）
  assert.ok(lines.includes(`${INI_KEYS.general.name}=evil  [Injected]  Hacked=1`));
  // info 的内嵌换行同样被净化为单行
  assert.ok(lines.includes(`${INI_KEYS.general.info}=多 行 描述`));

  // extraSections 的节名与键同样经过净化（逃生舱也不能成为注入口）。
  const out2 = emitSkinIni({
    general: { name: "n" },
    display: { fontSize: 12, pinyinColor: "#000000", firstColor: "#ff0000", candColor: "#111111" },
    extraSections: [{ section: "Ev\r\nil", entries: { "k\ny": "v\r\nw" } }],
  });
  const lines2 = out2.split("\r\n");
  assert.ok(lines2.includes("[Ev  il]"), "节名内换行被净化为空格");
  assert.ok(lines2.includes("k y=v  w"), "键与值内换行被净化为空格");
});
