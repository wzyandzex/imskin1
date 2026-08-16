/**
 * PreviewProfile —— 平台差异进入预览的唯一入口（PRE-001 / docs/02 §3）。
 *
 * 职责：按 Outlet 提供预览层的平台差异数据（状态栏/功能栏指示、候选交互说明），
 * 并**诚实标注**当前仅为模拟、未经真机审计的能力（docs/00 §3.1：不假装等价）。
 *
 * 边界：本文件是预览层 profile 的首版（状态栏差异）。布局键位/候选行为差异随
 * MOB-004 与各出口 previewProfile 任务深化；未真实还原前一律进 simulated 列表。
 */

import type { Outlet } from "@imskin/contracts";

export interface PreviewProfile {
  outlet: Outlet;
  /** 当前目标徽标显示名。 */
  label: string;
  /** 状态栏/功能栏指示项（平台差异的可感载体；顺序与内容按厂商区分）。 */
  statusItems: string[];
  /** 候选栏交互差异说明（展示在 tooltip）。 */
  candidateNote: string;
  /** 该 profile 以模拟呈现、未经真实客户端审计的能力。 */
  simulated: string[];
}

export const PREVIEW_PROFILES: Record<Outlet, PreviewProfile> = {
  sogou_pc: {
    outlet: "sogou_pc",
    label: "搜狗 PC",
    statusItems: ["中", "英", "全/半", "键盘"],
    candidateNote: "候选横排 · 右侧翻页箭头",
    simulated: ["状态栏图标为示意，未按真实客户端审计"],
  },
  sogou_android: {
    outlet: "sogou_android",
    label: "搜狗 Android",
    statusItems: ["中", "符", "九/26", "语音"],
    candidateNote: "候选横排滑动翻页",
    simulated: ["功能栏顺序未经真机审计（R-16）", "按键音为合成音，非皮肤自带资源", "振动为浏览器模拟，真机更强"],
  },
  baidu_pc: {
    outlet: "baidu_pc",
    label: "百度 PC",
    statusItems: ["中", "英", "符", "五笔"],
    candidateNote: "候选横排 · 分隔样式与搜狗不同",
    simulated: ["状态栏图标为示意，未按真实客户端审计"],
  },
  baidu_android: {
    outlet: "baidu_android",
    label: "百度 Android",
    statusItems: ["中", "英", "符", "按键自定义"],
    candidateNote: "候选横排滑动翻页",
    simulated: ["功能栏/按键自定义能力未经真机审计（R-16）", "振动为浏览器模拟，真机更强"],
  },
};

export function profileFor(outlet: Outlet): PreviewProfile {
  return PREVIEW_PROFILES[outlet];
}
