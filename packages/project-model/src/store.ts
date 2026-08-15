/**
 * ProjectStore —— 皮肤项目版本树的纯内存状态模型（架构 §5.5 / §7.1）。
 *
 * 设计要点：
 * - 纯内存、无 I/O；id 用**自增计数**确定性生成（项目 p1/p2…、版本 v1/v2…），
 *   绝不用 Math.random / Date.now，从而"相同操作序列 ⇒ 相同 id 与结构"，可完备单测。
 * - 版本一经创建即不可变：fork / mergeElement 都**产出新版本**而非改旧版本，
 *   这是版本树"可回溯、可回滚、可局部合并"（§5.5）的地基。
 * - 读方法（get/list/children/lineage 返回值）一律返回**快照拷贝**，
 *   外部改动不会污染 store 内部状态；data 为浅拷贝（顶层容器隔离，嵌套引用共享，符合"存引用即可"）。
 * - 错误策略：有自然"空"答案的读放行（getVersion→undefined、list/children/satisfiedElements→[]、
 *   isSatisfied→false）；需要目标必须存在的写/血缘计算则**抛错**（addVersion/fork/mergeElement/
 *   markSatisfied/lineage 遇未知 id 抛 Error）。
 */

import type {
  Project,
  Version,
  VersionStatus,
  SatisfactionMark,
} from "./types.ts";

/** 建项目的可选参数。 */
export interface CreateProjectOptions {
  targetPlatforms?: string[];
}

/** 新增版本的可选参数。parentId 省略或显式 null ⇒ 根版本。 */
export interface AddVersionOptions {
  /** 父版本 id；省略/ null=根。若给定，必须是**同项目**的已有版本。 */
  parentId?: string | null;
  data?: Record<string, unknown>;
  label?: string;
  /** 默认 "draft"。 */
  status?: VersionStatus;
}

/** fork 的覆盖项：以被 fork 的版本为父分叉，可覆写这些字段（parentId 固定为被 fork 版本，不可另指）。 */
export interface ForkOverrides {
  /** 叠加/覆盖到继承自父版本的 data 之上。 */
  data?: Record<string, unknown>;
  label?: string;
  /** 默认 "draft"。 */
  status?: VersionStatus;
}

export interface ProjectStoreOptions {
  /**
   * 可注入时钟：提供则用其返回值写入 Project.createdAt。
   * 默认不注入 ⇒ store 完全确定性、不写入 createdAt、绝不触碰系统时间。
   */
  now?: () => string;
}

/** 可 JSON 序列化的完整状态快照（含自增计数，恢复后新增 id 不与历史冲突）。 */
export interface ProjectStoreSnapshot {
  projects: Project[];
  versions: Version[];
  marks: SatisfactionMark[];
  projectSeq: number;
  versionSeq: number;
}

export class ProjectStore {
  private readonly projects = new Map<string, Project>();
  private readonly versions = new Map<string, Version>();
  /** versionId → (elementId → mark)，双层 Map 保留插入顺序。 */
  private readonly marks = new Map<string, Map<string, SatisfactionMark>>();
  private readonly now?: () => string;

  private projectSeq = 0;
  private versionSeq = 0;

  constructor(opts: ProjectStoreOptions = {}) {
    this.now = opts.now;
  }

  /** 建项目，确定性 id p1/p2…。targetPlatforms 可选（对应架构 target_platforms[]）。 */
  createProject(name: string, opts: CreateProjectOptions = {}): Project {
    const id = `p${++this.projectSeq}`;
    const project: Project = { id, name };
    if (opts.targetPlatforms) project.targetPlatforms = [...opts.targetPlatforms];
    if (this.now) project.createdAt = this.now();
    this.projects.set(id, project);
    return this.snapshotProject(project);
  }

  /** 新增版本，确定性 id v1/v2…。parentId 省略=根版本(null)。项目/父版本非法则抛错。 */
  addVersion(projectId: string, opts: AddVersionOptions = {}): Version {
    if (!this.projects.has(projectId)) {
      throw new Error(`未知项目: ${projectId}`);
    }
    const parentId = opts.parentId ?? null;
    if (parentId !== null) {
      const parent = this.versions.get(parentId);
      if (!parent) throw new Error(`未知父版本: ${parentId}`);
      if (parent.projectId !== projectId) {
        throw new Error(`父版本 ${parentId} 不属于项目 ${projectId}`);
      }
    }
    return this.insertVersion({
      projectId,
      parentId,
      status: opts.status ?? "draft",
      label: opts.label,
      data: opts.data ? { ...opts.data } : {},
    });
  }

  /** 取版本；未知 id 返回 undefined。 */
  getVersion(id: string): Version | undefined {
    const v = this.versions.get(id);
    return v ? this.snapshotVersion(v) : undefined;
  }

  /** 列出某项目的全部版本（插入顺序）；未知项目返回 []。 */
  listVersions(projectId: string): Version[] {
    const out: Version[] = [];
    for (const v of this.versions.values()) {
      if (v.projectId === projectId) out.push(this.snapshotVersion(v));
    }
    return out;
  }

  /** 直接子版本（parentId===versionId，插入顺序）；无子/未知 id 返回 []。 */
  children(versionId: string): Version[] {
    const out: Version[] = [];
    for (const v of this.versions.values()) {
      if (v.parentId === versionId) out.push(this.snapshotVersion(v));
    }
    return out;
  }

  /**
   * 以某历史版本为父分叉出新版本（§5.5"以某历史版本为基础分叉"）。
   * 语义：继承父版本 data（浅拷贝）作为起点，再叠加 overrides。未知 versionId 抛错。
   */
  fork(versionId: string, overrides: ForkOverrides = {}): Version {
    const parent = this.requireVersion(versionId);
    return this.insertVersion({
      projectId: parent.projectId,
      parentId: parent.id,
      status: overrides.status ?? "draft",
      label: overrides.label,
      data: { ...(parent.data ?? {}), ...(overrides.data ?? {}) },
    });
  }

  /**
   * UX-003 定稿确认：ready → confirmed 的唯一入口（显式用户命令产生，docs/01 §5.1）。
   * 只有通过自检（ready）的版本可确认；draft（自检未过）抛错且信息可直接展示。
   * 确认后的任何反馈/fork 产生新版本（ready/draft），不继承确认——由 fork 覆写保证。
   * 注意：confirmed 是版本生命周期状态，**不代表任何出口 install_verified**（ADR-001）。
   */
  confirmVersion(versionId: string): Version {
    const v = this.requireVersion(versionId);
    if (v.status === "confirmed") {
      throw new Error(`版本 ${versionId} 已确认，无需重复确认`);
    }
    if (v.status !== "ready") {
      throw new Error(`版本 ${versionId} 状态为 ${v.status}（自检未通过），暂不能确认`);
    }
    v.status = "confirmed";
    return this.snapshotVersion(v);
  }

  /** 从根到该版本的血缘链（含自身，根在前）。未知 versionId 抛错。 */
  lineage(versionId: string): Version[] {
    let cur: Version | undefined = this.requireVersion(versionId);
    const chain: Version[] = [];
    const seen = new Set<string>();
    while (cur) {
      // 防御：构造保证无环（父 id 恒早于子），此处兜底避免脏数据导致死循环。
      if (seen.has(cur.id)) throw new Error(`版本链存在环: ${cur.id}`);
      seen.add(cur.id);
      chain.push(this.snapshotVersion(cur));
      cur = cur.parentId ? this.versions.get(cur.parentId) : undefined;
    }
    return chain.reverse();
  }

  /**
   * 把 from 版本的某元素合并进 to 版本，**产出以 to 为父的新版本**（§5.5 元素级合并）。
   * 新版本继承 to 的 data，写入合并溯源 mergedFrom，并搬运被合并元素。
   * from/to 未知或跨项目则抛错。
   */
  mergeElement(
    fromVersionId: string,
    toVersionId: string,
    elementId: string,
  ): Version {
    const from = this.requireVersion(fromVersionId);
    const to = this.requireVersion(toVersionId);
    if (from.projectId !== to.projectId) {
      throw new Error(
        `跨项目合并不被支持: ${fromVersionId} → ${toVersionId}`,
      );
    }
    const data: Record<string, unknown> = { ...(to.data ?? {}) };
    // 元素级搬运：当元素以顶层 key 寻址时，把 from 的该元素值拷入结果。
    // PROVISIONAL(待核实)：AssetBundle 的 element_id 寻址方案（架构 §7.1）尚未定稿——
    // 这里仅处理"data 顶层 key === elementId"的直接情形；嵌套/命名空间寻址待格式审计后补齐。
    if (Object.prototype.hasOwnProperty.call(from.data ?? {}, elementId)) {
      data[elementId] = (from.data as Record<string, unknown>)[elementId];
    }
    // 记录合并来源（每个合并结果版本恰由一次合并产生，故为单条溯源；历史经父链回溯）。
    data.mergedFrom = { elementId, fromVersionId };
    return this.insertVersion({
      projectId: to.projectId,
      parentId: to.id,
      status: "draft",
      label: `合并 ${elementId}`,
      data,
    });
  }

  /** 标记某版本的某元素"已满意"。同 (version,element) 重复标记会更新 source。未知 versionId 抛错。 */
  markSatisfied(
    versionId: string,
    elementId: string,
    source: SatisfactionMark["source"],
  ): void {
    this.requireVersion(versionId);
    let byElement = this.marks.get(versionId);
    if (!byElement) {
      byElement = new Map<string, SatisfactionMark>();
      this.marks.set(versionId, byElement);
    }
    byElement.set(elementId, { versionId, elementId, source });
  }

  /** 某版本的某元素是否已标记满意；未知版本/未标记均为 false。 */
  isSatisfied(versionId: string, elementId: string): boolean {
    return this.marks.get(versionId)?.has(elementId) ?? false;
  }

  /** 某版本已标记满意的元素 id 列表（插入顺序）；未知版本返回 []。 */
  satisfiedElements(versionId: string): string[] {
    const byElement = this.marks.get(versionId);
    return byElement ? [...byElement.keys()] : [];
  }

  /** 导出完整状态快照（深拷贝，可安全 JSON 序列化用于持久化）。 */
  snapshot(): ProjectStoreSnapshot {
    const marks: SatisfactionMark[] = [];
    for (const byElement of this.marks.values()) {
      for (const m of byElement.values()) marks.push({ ...m });
    }
    return {
      projects: [...this.projects.values()].map((p) => this.snapshotProject(p)),
      versions: [...this.versions.values()].map((v) => this.snapshotVersion(v)),
      marks,
      projectSeq: this.projectSeq,
      versionSeq: this.versionSeq,
    };
  }

  /** 从快照重建 store（含自增计数，保证后续新增 id 不与历史冲突）。 */
  static fromSnapshot(snap: ProjectStoreSnapshot, opts: ProjectStoreOptions = {}): ProjectStore {
    const store = new ProjectStore(opts);
    for (const p of snap.projects) {
      store.projects.set(p.id, {
        id: p.id,
        name: p.name,
        ...(p.targetPlatforms ? { targetPlatforms: [...p.targetPlatforms] } : {}),
        ...(p.createdAt !== undefined ? { createdAt: p.createdAt } : {}),
      });
    }
    for (const v of snap.versions) {
      store.versions.set(v.id, {
        id: v.id,
        projectId: v.projectId,
        parentId: v.parentId,
        status: v.status,
        data: { ...(v.data ?? {}) },
        ...(v.label !== undefined ? { label: v.label } : {}),
      });
    }
    for (const m of snap.marks) {
      let byElement = store.marks.get(m.versionId);
      if (!byElement) {
        byElement = new Map<string, SatisfactionMark>();
        store.marks.set(m.versionId, byElement);
      }
      byElement.set(m.elementId, { ...m });
    }
    store.projectSeq = snap.projectSeq;
    store.versionSeq = snap.versionSeq;
    return store;
  }

  // ——— 内部工具 ———

  /** 落库一个新版本并返回其快照；集中 id 生成，保证自增确定性。 */
  private insertVersion(fields: {
    projectId: string;
    parentId: string | null;
    status: VersionStatus;
    label?: string;
    data: Record<string, unknown>;
  }): Version {
    const id = `v${++this.versionSeq}`;
    const version: Version = {
      id,
      projectId: fields.projectId,
      parentId: fields.parentId,
      status: fields.status,
      data: fields.data,
    };
    if (fields.label !== undefined) version.label = fields.label;
    this.versions.set(id, version);
    return this.snapshotVersion(version);
  }

  /** 取内部版本引用；不存在则抛错（供写/血缘等"必须存在"的路径使用）。 */
  private requireVersion(id: string): Version {
    const v = this.versions.get(id);
    if (!v) throw new Error(`未知版本: ${id}`);
    return v;
  }

  /** 版本快照：隔离内部状态。data 浅拷贝（顶层容器隔离，嵌套引用共享）。 */
  private snapshotVersion(v: Version): Version {
    const out: Version = {
      id: v.id,
      projectId: v.projectId,
      parentId: v.parentId,
      status: v.status,
      data: { ...(v.data ?? {}) },
    };
    if (v.label !== undefined) out.label = v.label;
    return out;
  }

  /** 项目快照：隔离内部状态。 */
  private snapshotProject(p: Project): Project {
    const out: Project = { id: p.id, name: p.name };
    if (p.targetPlatforms) out.targetPlatforms = [...p.targetPlatforms];
    if (p.createdAt !== undefined) out.createdAt = p.createdAt;
    return out;
  }
}
