/**
 * 皮肤项目的领域模型类型（架构 §7.1 领域模型 / §5.5 版本树）。
 *
 * 版本树：Version.parentId 使版本天然成树（非线性历史，null=根），支撑 §5.5 的
 * "以某历史版本分叉"与"元素级合并"。SatisfactionMark 记录跨版本的"已确认满意"元素，
 * 供重生成时"保留 + 仅必要一致性微调"策略参考（§5.4）。
 *
 * 本包只承载结构与状态，不耦合具体产出物类型：Version.data 用不透明的
 * Record<string,unknown> 存 DesignBrief / VisualSpec / SkinManifest 等引用即可。
 */

/** 皮肤项目：一个项目下挂一棵版本树（架构 §7.1）。 */
export interface Project {
  id: string;
  name: string;
  /** 目标出口（如 "sogou_pc" / "baidu_mobile"），对应架构 target_platforms[]。 */
  targetPlatforms?: string[];
  /**
   * 创建时间（ISO 串）。默认不写入——由 ProjectStore 的可注入时钟提供，
   * 从而保证 store 本身确定性、绝不触碰 Date.now（见 store.ts 的 ProjectStoreOptions.now）。
   */
  createdAt?: string;
}

/**
 * 版本状态机（架构 §7.1）：
 * draft 草稿 → generating 生成中 → ready 可预览 → confirmed 用户确认 → exported 已导出安装包。
 */
export type VersionStatus =
  | "draft"
  | "generating"
  | "ready"
  | "confirmed"
  | "exported";

/** 版本树节点（架构 §7.1）。parentId=null 为根版本。 */
export interface Version {
  id: string;
  projectId: string;
  /** 分叉来源（架构 parent_version_id）；null=根。 */
  parentId: string | null;
  status: VersionStatus;
  /** 可选人读标签（版本树 UI 展示，如 "合并候选栏"）。 */
  label?: string;
  /** 不透明产出物容器：存 DesignBrief/VisualSpec/SkinManifest 等引用，及合并溯源（mergedFrom）。 */
  data?: Record<string, unknown>;
}

/**
 * "已确认满意"标记（架构 §7.1，跨版本）。
 * source：
 *   - explicit —— 用户明确表达满意（如点"确认此版本 / 满意"）；
 *   - inferred —— 从交互推断（架构原名 inferred_two_rounds_silent：连续两轮反馈都未再提及
 *                 该元素 ⇒ 推断大概率满意，§5.4）。本包只区分二值来源，推断规则不在本包实现。
 */
export interface SatisfactionMark {
  versionId: string;
  elementId: string;
  source: "explicit" | "inferred";
}
