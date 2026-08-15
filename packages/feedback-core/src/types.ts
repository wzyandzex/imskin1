/**
 * A5 反馈解析的公开数据契约（架构 §5.3 / §5.4）。
 *
 * 一次用户反馈先被 classifyFeedback 归类，再由 routeFeedback 决定从管线哪一层重跑，
 * 最后由 applyToSpec / applyToBrief 做**定向最小修改**——只动受影响字段，其余原样保留。
 */

/** 反馈的五种类型（对应架构 §5.3 表格的五行）。 */
export type FeedbackType =
  | "asset_param" // 具体资产参数：字号、颜色深浅、字体
  | "layout" // 布局/结构：位置、排列、间距
  | "style" // 整体风格/氛围：活泼↔稳重、中国风
  | "platform" // 平台特定：百度/搜狗某一端的问题
  | "interaction"; // 功能/交互：翻页、动效、按压反馈

/** classifyFeedback 的结果：类型 + 命中的关键词 + 置信度[0,1]。 */
export interface Classification {
  type: FeedbackType;
  /** 触发本次分类的关键词（供路由/UI 复用，如平台名用于"写明平台"）。 */
  hints: string[];
  /** 置信度[0,1]：命中越多、领先越大越高；全不命中时给低值兜底。 */
  confidence: number;
}

/**
 * 重跑起点。基础集为架构给出的 A1..A4 / interaction；
 * 平台类反馈额外用 'A3-platform' 表示"只走对应平台适配分支"
 * （§5.3 平台特定行：只路由该平台 A3 适配 + A4 分支，另一平台不受影响）。
 *
 * PROVISIONAL（待核实）：任务书给出的基础 union 为 'A1'|'A2'|'A3'|'A4'|'interaction'（不含
 * 'A3-platform'），却又要求 platform→'A3-platform'，二者不自洽。此处按"显式映射优先"扩展了该
 * 成员；若后续确认应以基础 union 为准（例如平台反馈实为 rerunFrom:'A3' + scope 标注平台），需回收。
 */
export type RerunStage = "A1" | "A2" | "A3" | "A4" | "A3-platform" | "interaction";

/** routeFeedback 的结果：从哪层重跑 + 受影响范围说明。 */
export interface RouteResult {
  rerunFrom: RerunStage;
  /** 受影响范围的自然语言说明（§5.3 表格"路由到"列的落地表述）。 */
  scope: string;
}
