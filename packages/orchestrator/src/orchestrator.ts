/**
 * 智能体编排层（架构 §2 / §3）—— 把已建好的各能力包用**结构化契约**串成产品主循环：
 *
 *   生成:  DesignBrief --A2 briefToSpec--> VisualSpec --A3 composeSkin--> SkinManifest
 *          --A6 checkSkin--> QAReport，落成版本树的一个版本（project-model）。
 *   迭代:  一句自然语言反馈 --A5 classify/route--> 定位到管线某层 --applyToBrief/applyToSpec-->
 *          只重跑受影响部分 --> 从原版本 fork 出新版本（§5.3 精准局部重跑、§5.5 版本树）。
 *   导出:  SkinManifest --A4--> skin.ini + 切图 --> .ssf（sogou-adapter）。
 *
 * 每个产出带 provenance 指纹（§3.2），支持后续增量缓存。
 *
 * 诚实边界：A1（模糊想法→简报的 LLM 理解）与 A3 的**真实位图资产生成**依赖外部 LLM/图像生成，
 * 未接入；本编排消费"已成形的 DesignBrief"，把确定性的 A2/A3(设计层)/A4(配置)/A5/A6 串通。
 * 搜狗导出默认产出 skin.ini（配色/字体），窗口背景切图需真实资产时由调用方传入。
 */

import {
  briefToSpec,
  composeSkin,
  deriveThemeBrief,
  type DesignBrief,
  type VisualSpec,
  type SkinManifest,
  type SkinMeta,
} from "@imskin/skin-gen";
import {
  classifyFeedback,
  routeFeedback,
  applyToSpec,
  applyToBrief,
  type Classification,
  type RouteResult,
} from "@imskin/feedback-core";
import { checkSkin, checkAssetBundle, checkConsistency, type QAReport, type AssetCheckResult } from "@imskin/qa-core";
import { ProjectStore, type Project, type Version } from "@imskin/project-model";
import { buildSsf, emitSkinIni, validateSsf, type SogouSkinProject } from "@imskin/sogou-adapter";
import { buildBds } from "@imskin/baidu-mobile-adapter";
import { buildBps } from "@imskin/baidu-pc-adapter";
import { buildSsf as buildSogouMobileSsf, type SogouMobileProject } from "@imskin/sogou-mobile-adapter";
import { provenance } from "./provenance.ts";
import { skinToSkinIni, type ToSkinIniOptions } from "./toSkinIni.ts";
import { skinToBaiduMobile } from "./toBaidu.ts";
import { skinToBaiduPc } from "./toBaiduPc.ts";
import { outletDeviceClass, outletVendor, profileForOutlet, type Outlet } from "@imskin/contracts";
import { paintStatusBarIcons, assetsToZipEntries, type StoredAsset } from "./genAssets.ts";
import { sha256, base64Encode } from "@imskin/zip";
import { e2eEvidencePassed } from "./e2eGate.ts";

/** 版本 data 里承载的一版设计全量产出。 */
export interface VersionDesign {
  brief: DesignBrief;
  spec: VisualSpec;
  skin: SkinManifest;
  /** 深浅双模式（FR-QA-3/DR-8）：另一主题的派生变体（spec.skin.theme 为另一值），随版本携带可追溯。 */
  variant?: { spec: VisualSpec; skin: SkinManifest };
  qa: QAReport;
  provenance: string;
  /** 若该版本由一次反馈迭代产生，记录反馈溯源。 */
  feedback?: { text: string; type: Classification["type"]; scope: string; targetOutlets?: Outlet[] };
  /**
   * PIPE-001 平台定向反馈的出口覆盖（通往 TargetVariant 的中间态，ADR-002）：
   * 只存被"百度/搜狗这边…"类反馈定向修改过的出口；其余出口沿用主设计。
   * 通用（非平台）反馈会整体重生成主设计并**清空覆盖**——四端重新同步。
   */
  outletOverrides?: Partial<Record<Outlet, { spec: VisualSpec; skin: SkinManifest; variant: { spec: VisualSpec; skin: SkinManifest } }>>;
  /**
   * A3-001b：按出口注册的确定性资产（base64 字节随快照持久化）。
   * 旧版本快照无此字段 → assetStatus 按空清单处理（缺口如实）。
   */
  assets?: Record<Outlet, StoredAsset[]>;
}

/** PIPE-001：从分类 hints 里解析被点名的厂商 → 其两出口；无指代或双指代返回 null（走通用路径）。 */
function platformTargetOutlets(hints: string[]): Outlet[] | null {
  const baidu = hints.some((h) => h.includes("百度"));
  const sogou = hints.some((h) => h.includes("搜狗"));
  if (baidu === sogou) return null; // 都无（泛指）或都有（等价于全部 → 与通用路径一致）
  return baidu ? ["baidu_pc", "baidu_android"] : ["sogou_pc", "sogou_android"];
}

export interface GenerateResult {
  version: Version;
  design: VersionDesign;
}

export interface FeedbackResult {
  version: Version;
  classification: Classification;
  route: RouteResult;
  design: VersionDesign;
}

export interface ExportResult {
  /** .ssf 字节（标准 zip 改后缀）。 */
  bytes: Uint8Array;
  /** 生成的 skin.ini 文本（便于查看/调试）。 */
  iniText: string;
  /** 打入的切图数量（0 表示仅 skin.ini，真实位图资产待接入）。 */
  imageCount: number;
}

export interface BaiduExportResult {
  /** .bds 字节（标准 zip 改后缀）。 */
  bytes: Uint8Array;
  /** 打入的素材数量。 */
  imageCount: number;
  /** 是否含 port/land 布局（0 表示仅骨架，真实切图坐标待接入）。 */
  layoutCount: number;
}

export interface BaiduPcExportResult {
  /** .bps 字节（标准 zip 改后缀）。 */
  bytes: Uint8Array;
  /** 打入的素材数量。 */
  imageCount: number;
}

export interface SogouMobileExportResult {
  /** .ssf 字节（普通 zip，非 PC 加密容器）。 */
  bytes: Uint8Array;
  /** 打入的布局文件数。 */
  layoutCount: number;
  /** 打入的素材数量。 */
  imageCount: number;
}

/** JOB-001：单出口导出结果——成功给字节，失败给结构化 Diagnostic（出口间互不影响）。 */
export type OutletExportResult =
  | {
      ok: true;
      outlet: Outlet;
      bytes: Uint8Array;
      imageCount: number;
      layoutCount?: number;
      /** OUT-SGPC-001：包结构报告（G4 结构子集）。sogou_pc 已接校验器；其余出口随各自
       *  字段收口接入——undefined 在交付闸门中按 not_run 处理（等同 failed，docs/03 §4）。 */
      structuralReport?: { ok: boolean; issues: string[]; entries: string[] };
    }
  | {
      ok: false;
      outlet: Outlet;
      diagnostic: {
        code: string;
        stage: string;
        severity: "error";
        userMessage: string;
        technicalMessage: string;
        retryable: boolean;
        outlets?: Outlet[];
      };
    };

function metaOf(skin: SkinManifest): SkinMeta {
  return {
    id: skin.id,
    name: skin.name,
    platform: skin.meta.platform,
    device: skin.meta.device,
    mood: skin.meta.mood,
  };
}

/** 派生另一主题的深浅双模式变体（FR-QA-3）：基于主 spec 的 theme 取反，重跑 A2→A3（内建可读性 QA）。 */
function deriveVariant(brief: DesignBrief, spec: VisualSpec, skin: SkinManifest): { spec: VisualSpec; skin: SkinManifest } {
  const other = spec.theme === "dark" ? "light" : "dark";
  const vBrief = deriveThemeBrief(brief, other);
  const vSpec = briefToSpec(vBrief);
  const vSkin = composeSkin(vSpec, metaOf(skin));
  return { spec: vSpec, skin: vSkin };
}

export class SkinOrchestrator {
  readonly store: ProjectStore;
  /** 可选 LLM 增强钩子（llm-core 注入；不破坏零依赖——用结构化类型而非 import）。 */
  llm?: {
    /** A1 反馈语义增强：返回 direction 文本（用于更强的定向修改），失败返回 null 走确定性。 */
    understandFeedback?: (text: string) => Promise<{ type: string; direction: string; target?: string } | null>;
    /** A3 图像生成：由设计意图产键盘背景位图（PNG 字节），失败返回 null 走纯色/渐变。 */
    generateKeyboardBg?: (brief: DesignBrief) => Promise<Uint8Array | null>;
  };

  constructor(store?: ProjectStore) {
    this.store = store ?? new ProjectStore();
  }

  createProject(name: string, targetPlatforms?: string[]): Project {
    return this.store.createProject(name, targetPlatforms ? { targetPlatforms } : {});
  }

  /** A2→A3→A6：从设计简报生成一版皮肤，落成（可指定父版本，缺省为新根）。 */
  generate(
    projectId: string,
    brief: DesignBrief,
    meta: { id: string; name: string },
    parentId?: string | null,
  ): GenerateResult {
    const spec = briefToSpec(brief);
    const skin = composeSkin(spec, {
      id: meta.id,
      name: meta.name,
      platform: brief.platform,
      device: brief.device,
      mood: brief.mood,
    });
    const qa = checkSkin(skin);
    // A3-001b：确定性资产（状态栏图标）注册进快照——按出口生效 spec 的选中色绘制，
    // 每口一份（平台覆盖版本沿用其覆盖 spec 重绘，见 applyFeedback 平台分支）。
    const assets = this.paintAssetsFor(spec);
    const design: VersionDesign = {
      brief,
      spec,
      skin,
      variant: deriveVariant(brief, spec, skin),
      qa,
      provenance: provenance({ brief }),
      assets,
    };
    const version = this.store.addVersion(projectId, {
      parentId: parentId ?? null,
      data: design as unknown as Record<string, unknown>,
      status: qa.passed ? "ready" : "draft",
      label: meta.name,
    });
    return { version, design };
  }

  /** A3-001b：按 spec 为四出口生成确定性资产（当前 = 状态栏图标集；几何风格，
   *  knownLimitation 见 genAssets.ts 头注与风险台账 R-01 的字段名待核）。 */
  private paintAssetsFor(spec: VisualSpec): Record<Outlet, StoredAsset[]> {
    const paint = () => paintStatusBarIcons({ selectedFill: spec.candidateBar.selectedFill, candidateText: spec.candidateBar.candidate });
    return {
      sogou_pc: paint(),
      sogou_android: paint(),
      baidu_pc: paint(),
      baidu_android: paint(),
    };
  }

  /**
   * A5：一句反馈 → 分类/路由 → **只重跑受影响层** → 从原版本 fork 出新版本（§5.3/§5.5）。
   * - style（整体风格/氛围）→ 回 A1 层改 DesignBrief，再 A2→A3 重跑。
   * - asset_param/layout/platform → 在 VisualSpec 上定向最小改，A3 重跑（不动简报）。
   * - interaction → 交互参数层，不改视觉资产（此处保持皮肤不变，仅记录）。
   */
  /** A5 同步（确定性）：一句反馈 → 分类/路由 → 只重跑受影响层 → fork 出新版本。 */
  applyFeedback(versionId: string, text: string): FeedbackResult {
    const prev = this.readDesign(versionId);
    // PIPE-001：hints 透传——平台类反馈的 scope 写明厂商，并据此定向目标出口。
    const classification = classifyFeedback(text);
    const route = routeFeedback(classification.type, classification.hints);
    const meta = metaOf(prev.skin);
    const targetOutlets = route.rerunFrom === "A3-platform" ? platformTargetOutlets(classification.hints) : null;

    let brief = prev.brief;
    let spec = prev.spec;
    let skin = prev.skin;

    // PIPE-001 平台定向：只重跑被点名厂商的两出口（A3 适配 + A4 对应分支），
    // 主设计（brief/spec/skin/variant）不动——未点名出口导出字节不变（token diff 可证）。
    if (targetOutlets) {
      const overrides: NonNullable<VersionDesign["outletOverrides"]> = { ...(prev.outletOverrides ?? {}) };
      const nextAssets: Record<Outlet, StoredAsset[]> = { ...(prev.assets ?? ({} as Record<Outlet, StoredAsset[]>)) };
      for (const o of targetOutlets) {
        const baseSpec = overrides[o]?.spec ?? prev.spec;
        const oSpec = applyToSpec(baseSpec, text);
        const oMeta = { ...meta, platform: outletVendor(o), device: outletDeviceClass(o) === "pc" ? ("pc" as const) : ("mobile" as const) };
        const oSkin = composeSkin(oSpec, oMeta);
        overrides[o] = { spec: oSpec, skin: oSkin, variant: deriveVariant(prev.brief, oSpec, oSkin) };
        // A3-001b：覆盖出口的资产按覆盖 spec 重绘（如选中色被定向修改）
        nextAssets[o] = this.paintAssetsFor(oSpec)[o];
      }
      const design: VersionDesign = {
        brief,
        spec,
        skin,
        variant: prev.variant,
        qa: prev.qa, // 主设计未变，QA 结论沿用
        provenance: provenance({ parent: prev.provenance, text, type: classification.type, outlets: targetOutlets.join(",") }),
        feedback: { text, type: classification.type, scope: route.scope, targetOutlets },
        outletOverrides: overrides,
        assets: nextAssets,
      };
      const version = this.store.fork(versionId, {
        data: design as unknown as Record<string, unknown>,
        status: prev.qa.passed ? "ready" : "draft",
        label: `反馈·${classification.type}·${targetOutlets.map(outletVendor).join("/")}`,
      });
      return { version, classification, route, design };
    }

    switch (route.rerunFrom) {
      case "A1":
        brief = applyToBrief(prev.brief, text);
        spec = briefToSpec(brief);
        skin = composeSkin(spec, { ...meta, mood: brief.mood });
        break;
      case "A2":
      case "A3":
      case "A3-platform":
        spec = applyToSpec(prev.spec, text);
        skin = composeSkin(spec, meta);
        break;
      case "A4":
      case "interaction":
        break;
    }

    const qa = checkSkin(skin);
    const specChanged = route.rerunFrom === "A1" || route.rerunFrom === "A2" || route.rerunFrom === "A3" || route.rerunFrom === "A3-platform";
    const variant = specChanged ? deriveVariant(brief, spec, skin) : prev.variant;
    // 通用（非定向）反馈重生成主设计 → 清空出口覆盖（四端重新同步，ADR-002）。
    // A3-001b：spec 变化时按新 spec 重绘资产（颜色/字号反馈会改变图标着色）；
    // spec 未变（interaction/A4）沿用上一版资产。
    const design: VersionDesign = {
      brief,
      spec,
      skin,
      variant,
      qa,
      provenance: provenance({ parent: prev.provenance, text, type: classification.type }),
      feedback: { text, type: classification.type, scope: route.scope },
      assets: specChanged ? this.paintAssetsFor(spec) : prev.assets,
    };
    const version = this.store.fork(versionId, {
      data: design as unknown as Record<string, unknown>,
      status: qa.passed ? "ready" : "draft",
      label: `反馈·${classification.type}`,
    });
    return { version, classification, route, design };
  }

  /**
   * A5 异步（LLM 增强）：先用 `llm.understandFeedback` 把口语化/复合反馈解析成结构化 direction，
   * 再用增强后的文本走确定性定向修改；LLM 不可用/失败则原样走同步路径（诚实降级）。
   * 增强点：把"感觉有点廉价"这类确定性关键词命不中的反馈，转成"更高级、更有质感"等可操作文本。
   */
  async applyFeedbackSmart(versionId: string, text: string): Promise<FeedbackResult> {
    let effective = text;
    if (this.llm?.understandFeedback) {
      try {
        const intent = await this.llm.understandFeedback(text);
        if (intent?.direction) {
          // 把 LLM 的 direction 与原反馈拼接（保留原文线索 + 增强可操作性）
          effective = `${text}；${intent.direction}`;
        }
      } catch {
        /* LLM 失败 → 用原文走确定性 */
      }
    }
    return this.applyFeedback(versionId, effective);
  }

  /** A4（搜狗分支）：把某版本的皮肤导出为 .ssf。images 缺省则仅含 skin.ini（真实切图待接入）。 */
  exportSogou(
    versionId: string,
    opts: { images?: { path: string; data: Uint8Array }[]; ini?: ToSkinIniOptions; skin?: SkinManifest } = {},
  ): ExportResult {
    const design = this.readDesign(versionId);
    const skin = opts.skin ?? design.skin;
    const ini = skinToSkinIni(skin, opts.ini);
    const images = opts.images ?? [];
    const project: SogouSkinProject = { id: skin.id, name: skin.name, images, ini };
    return { bytes: buildSsf(project), iniText: emitSkinIni(ini), imageCount: images.length };
  }

  /**
   * A4（百度 Android 分支）：把某版本的皮肤导出为 `.bds`。真实 port/land 布局与素材由调用方提供
   * （A3 图像生成未接入）；配色/字号已由 skinToBaiduMobile 映射进 css.ini。字段经真实 APK 逆向确证。
   */
  exportBaiduMobile(
    versionId: string,
    opts: { port?: { path: string; content: string }[]; land?: { path: string; content: string }[]; images?: { path: string; data: Uint8Array }[]; skin?: SkinManifest } = {},
  ): BaiduExportResult {
    const design = this.readDesign(versionId);
    const skin = opts.skin ?? design.skin;
    const project = skinToBaiduMobile(skin);
    project.port = opts.port;
    project.land = opts.land;
    project.images = opts.images;
    return {
      bytes: buildBds(project),
      imageCount: opts.images?.length ?? 0,
      layoutCount: (opts.port?.length ?? 0) + (opts.land?.length ?? 0),
    };
  }

  /**
   * A4（百度 PC 分支）：把某版本的皮肤导出为 `.bps`。真实位图/精确布局坐标由调用方提供
   * （A3 图像生成未接入）；配色/字号已由 skinToBaiduPc 映射进 Candidate.xml。字段经真实皮肤解包确证。
   */
  exportBaiduPc(
    versionId: string,
    opts: { author?: string; images?: { path: string; data: Uint8Array }[]; skin?: SkinManifest } = {},
  ): BaiduPcExportResult {
    const design = this.readDesign(versionId);
    const skin = opts.skin ?? design.skin;
    const project = skinToBaiduPc(skin, { author: opts.author });
    project.images = opts.images;
    return { bytes: buildBps(project), imageCount: opts.images?.length ?? 0 };
  }

  /**
   * A4（搜狗 Android 分支）：把某版本的皮肤导出为 `.ssf`（普通 zip）。真实布局/资源由调用方提供
   * （A3 图像生成未接入）。结构经真实 APK 逆向确证。
   */
  exportSogouMobile(
    versionId: string,
    opts: { layouts?: { path: string; content: unknown }[]; images?: { path: string; data: Uint8Array }[]; skin?: SkinManifest } = {},
  ): SogouMobileExportResult {
    const design = this.readDesign(versionId);
    const skin = opts.skin ?? design.skin;
    const project: SogouMobileProject = {
      id: skin.id,
      name: skin.name,
      theme: { name: skin.name, id: skin.id },
      layouts: opts.layouts as SogouMobileProject["layouts"],
      res: opts.images,
    };
    return {
      bytes: buildSogouMobileSsf(project),
      layoutCount: opts.layouts?.length ?? 0,
      imageCount: opts.images?.length ?? 0,
    };
  }

  /** A4 导出四出口（可附带 A3 图像资产）：images 缺省则仅配置骨架。
   *  PIPE-001：各出口优先用 outletOverrides 的定向皮肤（无覆盖则用 opts.skin/主设计）。 */
  exportSkinSet(
    versionId: string,
    opts: { skin?: SkinManifest; images?: { path: string; data: Uint8Array }[] } = {},
  ): { sogouPc: Uint8Array; sogouMobile: Uint8Array; baiduPc: Uint8Array; baiduMobile: Uint8Array } {
    const design = this.readDesign(versionId);
    const byOutlet = (o: Outlet): SkinManifest => design.outletOverrides?.[o]?.skin ?? opts.skin ?? design.skin;
    const images = opts.images ?? [];
    const sp = byOutlet("sogou_pc");
    const ini = skinToSkinIni(sp);
    const sogouPc = buildSsf({ id: sp.id, name: sp.name, images, ini });
    const sm = byOutlet("sogou_android");
    const sogouMobile = buildSogouMobileSsf({ id: sm.id, name: sm.name, theme: { name: sm.name, id: sm.id }, res: images });
    const bp = byOutlet("baidu_pc");
    const baiduPcProject = skinToBaiduPc(bp);
    baiduPcProject.images = images;
    const baiduPc = buildBps(baiduPcProject);
    const bm = byOutlet("baidu_android");
    const baiduMobileProject = skinToBaiduMobile(bm);
    baiduMobileProject.images = images;
    const baiduMobile = buildBds(baiduMobileProject);
    return { sogouPc, sogouMobile, baiduPc, baiduMobile };
  }

  /**
   * JOB-001：单出口导出（隔离失败）。任一出口构建失败返回结构化 Diagnostic，
   * 不影响其他出口；成功返回该出口字节。委托到四个单出口方法（便于测试按出口
   * 替身/未来按出口注入构建策略）。stage 语义：真异步任务（资产→适配→QA→打包）
   * 随图像生成接入后展开，当前同步构建直接落到终态。
   */
  exportOutlet(
    versionId: string,
    outlet: Outlet,
    opts: { skin?: SkinManifest; images?: { path: string; data: Uint8Array }[] } = {},
  ): OutletExportResult {
    // PIPE-001：出口覆盖优先（平台定向反馈的产物）> 调用方主题变体 > 主设计。
    // 注：主题强制模式与出口覆盖的组合语义随 TargetVariant 完整落地（ADR-002 后续切片）。
    const design = this.readDesign(versionId);
    const overrideSkin = design.outletOverrides?.[outlet]?.skin;
    const common = { skin: overrideSkin ?? opts.skin, images: opts.images };
    // A3-001c/A3-002：黄金出口打入快照内注册的资产（状态栏图标 + 背景位图）
    if (outlet === "sogou_pc") {
      const stored = this.readDesign(versionId).assets?.sogou_pc;
      if (stored && stored.length > 0) {
        common.images = [...(opts.images ?? []), ...assetsToZipEntries(stored)];
      }
    }
    try {
      switch (outlet) {
        case "sogou_pc": {
          const r = this.exportSogou(versionId, common);
          // OUT-SGPC-001：黄金出口附 G4 结构报告（zip/CRC/入口/编码/关键节/路径安全）
          return { ok: true, outlet, bytes: r.bytes, imageCount: r.imageCount, structuralReport: validateSsf(r.bytes) };
        }
        case "sogou_android": {
          const r = this.exportSogouMobile(versionId, common);
          return { ok: true, outlet, bytes: r.bytes, imageCount: r.imageCount, layoutCount: r.layoutCount };
        }
        case "baidu_pc": {
          const r = this.exportBaiduPc(versionId, common);
          return { ok: true, outlet, bytes: r.bytes, imageCount: r.imageCount };
        }
        case "baidu_android": {
          const r = this.exportBaiduMobile(versionId, common);
          return { ok: true, outlet, bytes: r.bytes, imageCount: r.imageCount, layoutCount: r.layoutCount };
        }
      }
    } catch (e) {
      return {
        ok: false,
        outlet,
        diagnostic: {
          code: "OUTLET_BUILD_FAILED",
          stage: "A4",
          severity: "error" as const,
          userMessage: "该出口导出失败，可重试；其他出口不受影响。",
          technicalMessage: e instanceof Error ? e.message : String(e),
          retryable: true,
          outlets: [outlet],
        },
      };
    }
  }

  /** A3 图像生成（可选）：由 LLM 图像钩子产键盘背景位图；不可用返回 null（诚实降级，不产假图）。 */
  async generateKeyboardBg(versionId: string): Promise<Uint8Array | null> {
    if (!this.llm?.generateKeyboardBg) return null;
    const design = this.readDesign(versionId);
    try {
      return await this.llm.generateKeyboardBg(design.brief);
    } catch {
      return null;
    }
  }

  /**
   * A3-002：生成背景位图并应用为新版本（LLM → AssetDescriptor → SkinManifest image fill → fork）。
   * LLM 不可用/失败时返回 null（诚实降级：gradient 保留，不伪造位图）。
   * 成功时：① 注册 keyboard.background 资产（hash/base64/slice）；② 更新 skin 填充为
   * image + nine-slice；③ 打包路径 bg_keyboard.png；④ fork 新版本进版本树。
   */
  async applyGeneratedBackground(versionId: string): Promise<{ version: Version; design: VersionDesign } | null> {
    const bytes = await this.generateKeyboardBg(versionId);
    if (!bytes || bytes.byteLength === 0) return null;

    const prev = this.readDesign(versionId);
    const dataUrl = `data:image/png;base64,${base64Encode(bytes)}`;
    const DEFAULT_SLICE = { top: 100, right: 100, bottom: 100, left: 100 };

    const bgAsset: StoredAsset = {
      descriptor: {
        id: `ast_kb_bg_${sha256(bytes).slice(0, 8)}`,
        role: "keyboard.background",
        mediaType: "image/png",
        contentHash: sha256(bytes),
        byteLength: bytes.byteLength,
        source: "generated",
      },
      bytesB64: base64Encode(bytes),
      path: "bg_keyboard.png",
    };

    // 更新所有出口的 skin 键盘背景为 image fill（皮肤换面是全端同步的）
    const updateSkin = (s: SkinManifest): SkinManifest => ({
      ...s,
      keyboard: { ...s.keyboard, background: { type: "image", src: dataUrl, slice: DEFAULT_SLICE } },
    });

    const assets = { ...(prev.assets ?? ({} as Record<Outlet, StoredAsset[]>)) };
    for (const o of ["sogou_pc", "sogou_android", "baidu_pc", "baidu_android"] as const) {
      const list = [...(assets[o] ?? [])];
      const idx = list.findIndex((a) => a.descriptor.role === "keyboard.background");
      if (idx >= 0) list[idx] = bgAsset;
      else list.push(bgAsset);
      assets[o] = list;
    }

    const design: VersionDesign = {
      ...prev,
      skin: updateSkin(prev.skin),
      // variant 保留 gradient（图像不随主题切换；深色模式可另行生成）
      provenance: provenance({ parent: prev.provenance, text: "A3-002 背景位图生成", type: "asset_param" }),
      feedback: { text: "LLM 生成键盘背景位图", type: "asset_param", scope: "A3 图像生成 → image fill" },
      assets,
    };
    const version = this.store.fork(versionId, {
      data: design as unknown as Record<string, unknown>,
      status: prev.qa.passed ? "ready" : "draft",
      label: "背景位图",
    });
    return { version, design };
  }

  /** 版本血缘（根→该版本）。 */
  lineage(versionId: string): Version[] {
    return this.store.lineage(versionId);
  }

  /**
   * ASSET-001：某版本在某出口的资产完整性（G2 检查）。即时派生、不进快照。
   * 诚实边界：位图资产管道（A3→AssetDescriptor 注册）未接入，assets 恒为空——
   * 必需位图角色（如状态栏图标）如实落在 missingRequired，作为 install_candidate
   * 闸门的缺口依据（docs/03 §3），不伪造闭合。
   */
  assetStatus(versionId: string, outlet: Outlet): AssetCheckResult {
    const design = this.readDesign(versionId);
    return checkAssetBundle({
      profile: profileForOutlet(outlet),
      hasToken: (path) => {
        let cur: unknown = design.spec;
        for (const seg of path.split(".")) {
          if (typeof cur !== "object" || cur === null || !Object.prototype.hasOwnProperty.call(cur, seg)) return false;
          cur = (cur as Record<string, unknown>)[seg];
        }
        return cur !== undefined && cur !== null && cur !== "";
      },
      // A3-001b：消费快照内注册的资产（StoredAsset.descriptor 满足契约守卫）
      assets: (design.assets?.[outlet] ?? []).map((a) => a.descriptor),
    });
  }

  /**
   * QA-001/ENG-001b：某出口的交付等级评估（docs/03 Gate 聚合）。
   * 逐项检查 G0 确认 / G4 结构 / G3 可读性 / G2 资产 / G5 受控差异解释；
   * 任一缺口 → 维持 structural 并列出 blockers（机器 code + 人读说明）。
   *
   * ENG-001b：新增 G6 浏览器 E2E 证据检查——E2E 通过时 outlet 可获 previewable
   * （介于 structural 与 install_candidate 之间的独立路径，docs/03 §3）。
   * G6 证据来源：docs/evidence/e2e/latest.json（Playwright teardown 写入）。
   * install_verified 需 G7 真机证据（EVID-001），本评估不授予。
   */
  outletDeliveryLevel(versionId: string, outlet: Outlet): { level: "structural" | "previewable" | "install_candidate"; blockers: string[] } {
    const blockers: string[] = [];

    // G0：确认门禁（UX-003）
    const version = this.store.getVersion(versionId);
    if (version?.status !== "confirmed") {
      blockers.push("VERSION_NOT_CONFIRMED：需先「确认此版本」");
    }

    // G4：导出 + 结构报告（sogou_pc 已接校验器；其余出口 not_run = 未过，docs/03 §4）
    const exp = this.exportOutlet(versionId, outlet);
    if (!exp.ok) {
      blockers.push(`OUTLET_BUILD_FAILED：${exp.diagnostic.userMessage}`);
    } else if (!exp.structuralReport) {
      blockers.push("STRUCTURAL_NOT_RUN：该出口结构校验器未接入（视为未过）");
    } else if (!exp.structuralReport.ok) {
      blockers.push(`STRUCTURAL_FAILED：${exp.structuralReport.issues.join("；")}`);
    }

    // G3：可读性（该出口生效皮肤的 QA；平台覆盖存在时用覆盖皮肤）
    const design = this.readDesign(versionId);
    const effectiveSkin = design.outletOverrides?.[outlet]?.skin ?? design.skin;
    const qa = checkSkin(effectiveSkin);
    if (!qa.passed) {
      blockers.push("QA_ERROR：存在可读性 error（可在导出面板一键修复）");
    }

    // G2：资产闭合
    const assets = this.assetStatus(versionId, outlet);
    if (assets.missingRequired.length > 0) {
      blockers.push(`ASSET_MISSING：${assets.missingRequired.join("、")}`);
    }

    // G5（R-10 校准版）：两层——① 平台覆盖必须有反馈溯源（受控差异）；
    // ② 覆盖出口与主设计的感知色差 ≤ ΔE₀₀ 5（CIEDE2000，ADR-009）
    const overridden = Object.entries(design.outletOverrides ?? {}) as Array<[Outlet, unknown]>;
    const explained = design.feedback?.targetOutlets ?? [];
    for (const [o] of overridden) {
      if (!explained.includes(o)) {
        blockers.push(`PLATFORM_OVERRIDE_UNEXPLAINED：${o} 存在无溯源的平台差异`);
      }
    }
    // G5-②：覆盖出口的生效皮肤 vs 主皮肤——CIEDE2000 感知色差
    if (design.outletOverrides?.[outlet]) {
      const overrideSkin = design.outletOverrides[outlet]!.skin;
      const issues = checkConsistency(design.skin, overrideSkin);
      for (const iss of issues) {
        if (iss.code === "CONSISTENCY_DIVERGENCE") {
          blockers.push(`G5_${iss.code}：${iss.message}`);
        }
      }
    }

    // install_candidate 全过 → 直接给
    if (blockers.length === 0) return { level: "install_candidate", blockers };

    // ENG-001b：G6 检查——E2E 证据通过时可获 previewable（独立于 install_candidate 路径）
    if (e2eEvidencePassed()) {
      // previewable 的前置：G3 可读性通过（不能给看不清的皮肤标 previewable）
      if (qa.passed) {
        return { level: "previewable", blockers };
      }
      blockers.push("G6_PREVIEWABLE_BLOCKED：QA error 存在，previewable 暂不授予");
    }

    return { level: "structural", blockers };
  }

  /** 读取某版本的设计数据；缺失或非本编排产出则抛错。 */
  readDesign(versionId: string): VersionDesign {
    const v = this.store.getVersion(versionId);
    if (!v) throw new Error(`未知版本: ${versionId}`);
    const d = v.data as Partial<VersionDesign> | undefined;
    if (!d || !d.brief || !d.spec || !d.skin) {
      throw new Error(`版本 ${versionId} 缺少可迭代的设计数据（brief/spec/skin）`);
    }
    return d as VersionDesign;
  }
}
