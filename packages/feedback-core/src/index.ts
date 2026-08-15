/**
 * @imskin/feedback-core —— A5 反馈解析：分类 → 路由 → 定向最小修改（架构 §5.3 / §5.4）。
 *
 * - classifyFeedback：自然语言反馈 → 五类之一 + 命中关键词 + 置信度。
 * - routeFeedback：类型 → 重跑起点（管线哪一层）+ 范围说明。
 * - applyToSpec / applyToBrief：据反馈做**深拷贝后的最小字段修改**，其余原样保留。
 */

export type { FeedbackType, Classification, RerunStage, RouteResult } from "./types.ts";
export { classifyFeedback } from "./classify.ts";
export { routeFeedback } from "./route.ts";
export { applyToSpec, applyToBrief } from "./apply.ts";
