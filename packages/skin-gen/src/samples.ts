/**
 * 示例皮肤与示例设计简报。
 * - SAMPLE_SKINS：两套精调的手写皮肤（清冷极简 / 国潮水墨），作为预览稳定的内置选项。
 * - EXAMPLE_BRIEFS：示例设计简报，用于演示 generateSkin（意图 → 皮肤）整条链路。
 */

import type { SkinManifest } from "./types.ts";
import type { DesignBrief } from "./spec.ts";

const SANS = "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
const SERIF = "'Songti SC', 'STSong', 'SimSun', serif";

/** 清冷极简：冷调浅灰蓝，白键柔影，蓝色选中态。 */
export const coolMinimal: SkinManifest = {
  id: "cool-minimal",
  name: "清冷极简",
  meta: { platform: "sogou", device: "pc", mood: "清冷 · 极简 · 留白" },
  keyboard: {
    background: { type: "gradient", from: "#eef2f7", to: "#dbe4ee", angle: 135 },
    padding: 14,
    gap: 8,
    key: {
      fill: { type: "solid", color: "#ffffff" },
      color: "#2b3440",
      radius: 10,
      shadow: { x: 0, y: 1, blur: 3, color: "rgba(30,40,60,0.16)" },
    },
    keyActive: {
      fill: { type: "solid", color: "#d7e3f4" },
      shadow: { x: 0, y: 0, blur: 0, color: "transparent" },
    },
    specialKey: { fill: { type: "solid", color: "#ccd6e3" }, color: "#33404f" },
    font: { family: SANS, size: 18, weight: 500 },
  },
  candidateBar: {
    background: { type: "solid", color: "#f6f8fb" },
    composingColor: "#7b8794",
    candidateColor: "#2b3440",
    selectedColor: "#ffffff",
    selectedFill: { type: "gradient", from: "#4a90e2", to: "#357ac9", angle: 135 },
    indexColor: "#9aa5b1",
    font: { family: SANS, size: 18, weight: 500 },
  },
};

/** 国潮水墨：墨色深底，暖白键，朱红选中态，衬线字。 */
export const inkStyle: SkinManifest = {
  id: "ink-guochao",
  name: "国潮水墨",
  meta: { platform: "sogou", device: "pc", mood: "沉静 · 国潮 · 水墨" },
  keyboard: {
    background: { type: "gradient", from: "#2b2b33", to: "#131319", angle: 160 },
    padding: 14,
    gap: 8,
    key: {
      fill: { type: "gradient", from: "#3a3a44", to: "#2e2e37", angle: 135 },
      color: "#ece7dd",
      radius: 8,
      border: { width: 1, color: "rgba(255,255,255,0.06)" },
      shadow: { x: 0, y: 1, blur: 2, color: "rgba(0,0,0,0.45)" },
    },
    keyActive: { fill: { type: "solid", color: "#5a2b28" }, color: "#f5ece0" },
    specialKey: { fill: { type: "solid", color: "#23232b" }, color: "#b8afa0" },
    font: { family: SERIF, size: 18, weight: 500 },
  },
  candidateBar: {
    background: { type: "solid", color: "#1b1b21" },
    composingColor: "#b8afa0",
    candidateColor: "#ece7dd",
    selectedColor: "#fff7ef",
    selectedFill: { type: "solid", color: "#9e2b25" },
    indexColor: "#7d7568",
    font: { family: SERIF, size: 18, weight: 500 },
  },
};

export const SAMPLE_SKINS: SkinManifest[] = [coolMinimal, inkStyle];

/** 示例设计简报（演示"意图 → 皮肤"生成）。 */
export const EXAMPLE_BRIEFS: Array<{ id: string; name: string; brief: DesignBrief }> = [
  {
    id: "gen-fresh-green",
    name: "清新薄荷",
    brief: {
      styleKeywords: ["清新", "自然", "极简"],
      palette: { primary: "#3faf7d" },
      mood: "清新明亮",
      cornerRadius: "large",
    },
  },
  {
    id: "gen-cyber-night",
    name: "赛博夜航",
    brief: {
      styleKeywords: ["科技", "赛博"],
      palette: { primary: "#7a5cff", background: "#12101c" },
      mood: "深邃 神秘",
      cornerRadius: "small",
      materialDirection: "玻璃拟态",
    },
  },
  {
    id: "gen-sunset",
    name: "暖阳橙沙",
    brief: {
      styleKeywords: ["温暖", "圆润"],
      palette: { primary: "#e8843c", accent: "#d9542b" },
      mood: "温暖",
    },
  },
];
