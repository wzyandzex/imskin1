/**
 * @imskin/project-model —— 皮肤项目的版本树与状态模型（架构 §5.5 / §7.1）。
 *
 * 公开面：
 * - 类型：Project / Version / VersionStatus / SatisfactionMark
 * - 存储：ProjectStore（纯内存、确定性自增 id；建项目/加版本/分叉 fork/血缘 lineage/
 *         元素级合并 mergeElement/满意标记 markSatisfied）及其可选参数类型
 */

export type {
  Project,
  Version,
  VersionStatus,
  SatisfactionMark,
} from "./types.ts";

export {
  ProjectStore,
  validateProjectStoreSnapshot,
  type CreateProjectOptions,
  type AddVersionOptions,
  type ForkOverrides,
  type ProjectStoreOptions,
  type ProjectStoreSnapshot,
  type MergeRecord,
} from "./store.ts";
export { deepCopy } from "./immutable.ts";
