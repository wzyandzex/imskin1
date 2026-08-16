/**
 * 自动化服务层（@imskin/api 的核心）—— 把产品能力以编程接口开放。
 *
 * 形态（对齐业界：Replicate/fal.ai 的"创建任务→轮询/webhook"异步 job 模式 + Ollama 的本地 server）：
 * - 生成是耗时操作（LLM + 图像），用**异步 job**：POST 创建 → 返回 jobId → GET 轮询状态/取结果。
 * - 同步快操作（确定性生成、导出）也可同步返回（`Prefer: wait` 思想，短任务直接给结果）。
 * - 认证：Bearer API key（`Authorization: Bearer <key>`）。
 *
 * 本层与传输（HTTP/CLI）解耦：纯函数操作 SkinOrchestrator，便于同一套逻辑服务 REST 与 CLI。
 */

import { SkinOrchestrator } from "@imskin/orchestrator";
import { understandIntent, type LLMRegistry } from "@imskin/llm-core";
import type { DesignBrief } from "@imskin/skin-gen";
import { OUTLETS, OUTLET_API_KEYS, type Outlet } from "@imskin/contracts";

/**
 * REST 出口键从领域契约派生（DOM-001）：传输层保留 camelCase 兼容既有端点，
 * 但取值集合与 docs/01 §3.1 的 Outlet 一一对应，不再本地自造 union。
 */
export type OutletKey = (typeof OUTLET_API_KEYS)[Outlet];

export interface GenerateJobInput {
  /** 模糊想法（优先）或直接给 DesignBrief。 */
  idea?: string;
  brief?: DesignBrief;
  name?: string;
  /** 用哪个 LLM（"providerId:modelId"）；缺省用默认/确定性。 */
  llm?: string;
  /**
   * 参考图/视频关键帧（data URL 或 http URL），随 idea 走多模态理解（FR-INPUT-1）。
   * 诚实边界：本服务零依赖、不解视频——视频请在客户端抽好关键帧后作为图片传入。
   */
  referenceImages?: string[];
}

export type JobStatus = "queued" | "processing" | "succeeded" | "failed";

/** JOB-001：分出口导出状态（REST 键名沿用 camelCase 边界约定）。 */
export interface OutletJobStatus {
  outletKey: OutletKey;
  stage: "succeeded" | "failed";
  byteLength?: number;
  error?: string;
  technical?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  /** 进度 0..1。 */
  progress: number;
  /** 失败原因。 */
  error?: string;
  /** 成功产物：版本 id + 设计溯源（是否走了 LLM 降级）。 */
  result?: {
    versionId: string;
    label?: string;
    fellBack?: boolean;
    llmProvider?: string;
  };
  createdAt: number;
  updatedAt: number;
}

let jobSeq = 0;

/** 自动化服务：编排 + LLM + 异步 job。 */
export class AutomationService {
  readonly orch: SkinOrchestrator;
  private registry: LLMRegistry | null;
  private projectId: string;
  private jobs = new Map<string, Job>();

  constructor(opts: { orch?: SkinOrchestrator; registry?: LLMRegistry | null; projectName?: string } = {}) {
    this.orch = opts.orch ?? new SkinOrchestrator();
    this.registry = opts.registry ?? null;
    this.projectId = this.orch.createProject(opts.projectName ?? "自动化项目").id;
  }

  /** 同步生成（确定性，快）：直接给 brief 用。 */
  generateSync(input: GenerateJobInput): Job {
    const job = this.newJob();
    this.runGenerate(job, input);
    return job;
  }

  /** 异步生成（可能走 LLM，慢）：返回 jobId 供轮询。 */
  generateAsync(input: GenerateJobInput): Job {
    const job = this.newJob();
    // 异步执行，不阻塞返回
    void (async () => {
      await Promise.resolve();
      this.runGenerate(job, input);
    })();
    return job;
  }

  private newJob(): Job {
    const job: Job = { id: `job-${++jobSeq}`, status: "queued", progress: 0, createdAt: Date.now(), updatedAt: Date.now() };
    this.jobs.set(job.id, job);
    return job;
  }

  private runGenerate(job: Job, input: GenerateJobInput): void {
    job.status = "processing";
    job.updatedAt = Date.now();
    void (async () => {
      try {
        let brief: DesignBrief | undefined = input.brief;
        let fellBack: boolean | undefined;
        let llmProvider: string | undefined;
        if (!brief && input.idea) {
          if (this.registry?.available) {
            const images = input.referenceImages?.filter((s) => typeof s === "string" && s.length > 0);
            const r = await understandIntent(input.idea, this.registry, input.llm, images?.length ? { images } : undefined);
            brief = r.data;
            fellBack = r.fellBack;
            llmProvider = r.provenance.provider;
          } else {
            const { analyzeIntent } = await import("@imskin/skin-gen");
            brief = analyzeIntent(input.idea).brief;
            fellBack = true;
            llmProvider = "deterministic";
          }
        }
        if (!brief) throw new Error("需要 idea 或 brief");
        job.progress = 0.6;
        const name = input.name ?? brief.styleKeywords[0] ?? "自定义";
        const g = this.orch.generate(this.projectId, brief, { id: `auto-${job.id}`, name });
        job.progress = 1;
        job.status = "succeeded";
        job.result = { versionId: g.version.id, label: name, fellBack, llmProvider };
      } catch (e) {
        job.status = "failed";
        job.error = e instanceof Error ? e.message : String(e);
      } finally {
        job.updatedAt = Date.now();
      }
    })();
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** 导出某版本的四出口包（返回字节，传输层决定如何回传）。 */
  export(versionId: string): Record<OutletKey, Uint8Array> {
    const set = this.orch.exportSkinSet(versionId);
    return { sogouPc: set.sogouPc, sogouMobile: set.sogouMobile, baiduPc: set.baiduPc, baiduMobile: set.baiduMobile };
  }

  /**
   * JOB-001：分出口导出状态（独立隔离）。逐出口构建，一个失败不影响其他；
   * 真异步 job 队列（stage/progress/TTL）待图像生成接入后展开，当前同步落到终态。
   */
  exportOutletStatus(versionId: string): { jobs: OutletJobStatus[] } {
    const jobs = OUTLETS.map((outlet: Outlet) => {
      const r = this.orch.exportOutlet(versionId, outlet);
      return r.ok
        ? { outletKey: OUTLET_API_KEYS[outlet], stage: "succeeded" as const, byteLength: r.bytes.length }
        : { outletKey: OUTLET_API_KEYS[outlet], stage: "failed" as const, error: r.diagnostic.userMessage, technical: r.diagnostic.technicalMessage };
    });
    return { jobs };
  }

  /** 反馈迭代。 */
  feedback(versionId: string, text: string) {
    return this.orch.applyFeedback(versionId, text);
  }

  listVersions() {
    return this.orch.store.listVersions(this.projectId);
  }
}
