/**
 * 工作台外壳 —— 通过 @imskin/orchestrator 跑通产品主循环（架构 §5 / §6.1）：
 *   从设计意图生成 → 实时预览 → 自然语言反馈（分类/路由/定向重跑）→ 版本树 → 导出 .ssf。
 *
 * 左侧版本时间线（可点选任一历史版本预览、对比），右侧实时预览为主角；底部反馈栏常驻。
 * 诚实标注：移动端为竖屏触控预览；.bps/移动端出口与真实位图切图仍待 M0/图像生成（见 README）。
 */

import { useRef, useState } from "react";
import { SkinOrchestrator } from "@imskin/orchestrator";
import { outletFromParts } from "@imskin/contracts";
import { ProjectStore, type Project, type ProjectStoreSnapshot } from "@imskin/project-model";
import {
  EXAMPLE_BRIEFS,
  analyzeIntent,
  refineBrief,
  finalizeBrief,
  type DesignBrief,
  type ClarifyQuestion,
  type CornerPreference,
  type SkinManifest,
} from "@imskin/skin-gen";
import { LLMRegistry, understandIntent, understandFeedback, generateImage, skinImagePrompt } from "@imskin/llm-core";
import { PreviewRuntime } from "./preview/PreviewRuntime.tsx";
import { MobileFrame } from "./preview/MobileFrame.tsx";
import { layoutVersionTree, rowPrefix } from "./preview/versionTree.ts";
import { Tooltip } from "./components/Tooltip.tsx";
import { SettingsPage } from "./components/SettingsPage.tsx";
import { ModelSwitcher } from "./components/ModelSwitcher.tsx";
import { useGlobalShortcut, useShortcutCombos } from "./useShortcut.ts";
import { processRefFile, extractColors, type RefMedia } from "./input/refMedia.ts";
import { useSpeech } from "./input/useSpeech.ts";
import {
  type ModelConfigs,
  loadConfigs,
  saveConfigs,
  activeConfig,
  currentTier,
} from "./modelConfigs.ts";

/** 侧栏示意小图标（方框 + 右侧竖条），用于对话栏的显示/隐藏。 */
/** 侧栏示意小图标（方框 + 右侧竖条）。on=true 时右栏填充，表示"侧边栏已开启"。 */
function PanelIcon({ on = false }: { on?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      {/* 右栏（开启时填充） */}
      {on && <rect x="10.2" y="3.2" width="3.6" height="9.6" rx="1" fill="currentColor" />}
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9.5" y1="2.5" x2="9.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** 重置（清空重来）图标：逆时针回绕箭头。 */
function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <polyline points="13.7,1.6 13.7,4.8 10.5,4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** 设置（齿轮）图标：经典八齿 + 中心孔，比例匀称、克制。 */
function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path
        d="M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z"
        stroke="currentColor" strokeWidth="1.2"
      />
      <path
        d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
    </svg>
  );
}

/** 帮助（问号）图标：细线小圆圈 + 问号，克制。 */
function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.3 6.1a1.85 1.85 0 1 1 2.55 1.72c-.62.23-.75.66-.75 1.18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="8" cy="11.1" r="0.7" fill="currentColor" />
    </svg>
  );
}

/** A1 三阶段：想法输入 → （可选）克制式追问 → Brief 确认 → 生成。 */
type IntentPhase = "idle" | "clarify" | "confirm";

interface IntentDraft {
  brief: DesignBrief;
  inferredFields: string[];
  question?: ClarifyQuestion;
}

const FB_LABEL: Record<string, string> = {
  asset_param: "具体参数",
  layout: "布局结构",
  style: "整体风格",
  platform: "平台特定",
  interaction: "交互功能",
};

const DEFAULT_BRIEF: DesignBrief = {
  styleKeywords: ["清新", "极简"],
  palette: { primary: "#3faf7d" },
  mood: "清新明亮",
  cornerRadius: "large",
};

let idSeq = 0;

/** 可点选反馈的元素（FR-FEEDBACK-5）：label 给用户看，token 注入反馈文本供路由/定向修改。 */
interface PickedElement {
  /** 显示名（如"候选栏"）。 */
  label: string;
  /** 注入反馈文本的目标词（如"候选""按键"），让 applyToSpec 命中正确字段。 */
  token: string;
}

/** 右侧聊天栏的一条消息。 */
interface ChatMsg {
  id: number;
  role: "user" | "sys";
  text: string;
}

/** 细粒度可点选元素（FR-FEEDBACK-5 增强）：点选哪块就只改哪块。token 命中 applyToSpec 的目标词。 */
const PICKABLE: Record<string, PickedElement> = {
  candidate: { label: "候选词", token: "候选" },
  "candidate-selected": { label: "选中候选", token: "候选选中" },
  composing: { label: "拼音串", token: "候选" },
  key: { label: "字母键", token: "按键" },
  "key-special": { label: "功能键", token: "按键" },
  "keyboard-bg": { label: "键盘背景", token: "键盘背景" },
  "candidate-bg": { label: "候选栏背景", token: "候选栏背景" },
};

/** 追问维度 → DesignBrief 字段名（用于把"已回答"的字段从推断标注中去掉）。 */
function fieldKeyOf(field: ClarifyQuestion["field"]): string {
  return field === "palette" ? "palette.primary" : field === "styleKeywords" ? "styleKeywords" : "mood";
}

const CORNER_LABEL: Record<CornerPreference, string> = { small: "小", medium: "中", large: "大" };

// —— 本地持久化（localStorage）：刷新/重开不丢版本树 ——
const LS_KEY = "imskin:v1";
interface SavedState {
  store: ProjectStoreSnapshot;
  projectId: string;
  projectName: string;
  currentId: string;
}
function loadState(): SavedState | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch {
    return null;
  }
}
function saveState(s: SavedState): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* 配额/序列化异常一律忽略，绝不影响输入体验 */
  }
}

// —— LLM 接入（多套配置，存 localStorage；详见 modelConfigs.ts）——
/** 据多套配置构造注册表；启用的配置都注册，active 的设为默认。无启用则返回 null（走确定性降级）。 */
function buildRegistry(mc: ModelConfigs): LLMRegistry | null {
  const ens = mc.configs.filter((c) => c.enabled && c.baseUrl && c.model);
  if (ens.length === 0) return null;
  const r = new LLMRegistry();
  for (const c of ens) r.register({ id: c.id, baseUrl: c.baseUrl, apiKey: c.apiKey || undefined, model: c.model, timeoutMs: c.timeoutMs, headers: c.headers });
  const active = activeConfig(mc);
  if (active) r.setDefault(active.id);
  return r;
}
/** 当前生效配置的推理参数（注入 extraBody）。 */
function activeExtraBody(mc: ModelConfigs): Record<string, unknown> | undefined {
  const c = activeConfig(mc);
  if (!c) return undefined;
  return currentTier(c).params || undefined;
}
/** 当前生效配置的 ref（"id"，供 understandIntent/Feedback 用）。 */
function activeRef(mc: ModelConfigs): string | undefined {
  const c = activeConfig(mc);
  return c?.id;
}

type Boot = { orch: SkinOrchestrator; project: Project; currentId: string };

/** 全新项目 + 初始版本。 */
function freshBoot(): Boot {
  const orch = new SkinOrchestrator();
  const project = orch.createProject("我的皮肤项目");
  idSeq += 1;
  const v = orch.generate(project.id, DEFAULT_BRIEF, { id: `skin-${idSeq}`, name: "初始 · 清新薄荷" }).version;
  return { orch, project, currentId: v.id };
}

/** 自包含项目文件（FR-SHARE-1 / DR-9）：版本树 + 项目信息 + 当前版本，可跨设备导入继续编辑。 */
interface ProjectFile {
  format: "imskin-project";
  version: 1;
  savedAt: string;
  store: ProjectStoreSnapshot;
  projectId: string;
  projectName: string;
  currentId: string;
}

/** 校验并解析项目文件；非法/损坏返回 null（不抛错，导入失败明确提示而非崩溃）。 */
function parseProjectFile(text: string): ProjectFile | null {
  try {
    const o = JSON.parse(text) as Partial<ProjectFile>;
    if (o?.format !== "imskin-project" || o.version !== 1) return null;
    if (!o.store || !Array.isArray(o.store.versions) || !o.projectId || !o.currentId) return null;
    return o as ProjectFile;
  } catch {
    return null;
  }
}

/** 尝试从 localStorage 恢复；数据缺失/损坏/不自洽则返回 null。 */
function loadBoot(): Boot | null {
  const s = loadState();
  if (!s) return null;
  try {
    const orch = new SkinOrchestrator(ProjectStore.fromSnapshot(s.store));
    const versions = orch.store.listVersions(s.projectId);
    if (versions.length > 0 && versions.some((v) => v.id === s.currentId)) {
      return { orch, project: { id: s.projectId, name: s.projectName }, currentId: s.currentId };
    }
  } catch {
    /* 损坏数据 → 回退全新 */
  }
  return null;
}

export function App() {
  // 启动：恢复已存项目，否则新建。ref 守卫确保只跑一次（含 StrictMode 双调用）。
  const bootRef = useRef<Boot | null>(null);
  if (!bootRef.current) bootRef.current = loadBoot() ?? freshBoot();
  const orch = bootRef.current.orch;
  const project = bootRef.current.project;

  const [currentId, setCurrentId] = useState<string>(bootRef.current.currentId);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const [platform, setPlatform] = useState<"sogou" | "baidu">("sogou");
  const [device, setDevice] = useState<"pc" | "mobile">("pc");
  const [sound, setSound] = useState(false);
  const [idea, setIdea] = useState("");
  const [phase, setPhase] = useState<IntentPhase>("idle");
  const [draft, setDraft] = useState<IntentDraft | null>(null);
  const [feedback, setFeedback] = useState("");
  /** 反馈提交状态（UX-004）：busy 防重复提交（ref 同步守卫，state 驱动 UI）；error 可操作；emptyHint 字段级提示空输入。 */
  const [fbBusy, setFbBusy] = useState(false);
  const fbBusyRef = useRef(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbEmptyHint, setFbEmptyHint] = useState(false);
  const [echo, setEcho] = useState<null | { type: string; scope: string; passed: boolean; picked?: string }>(null);
  /** LLM 接入（多套配置）；llmStatus 记录最近一次生成的来源。 */
  const [modelConfigs, setModelConfigs] = useState<ModelConfigs>(() => loadConfigs());
  const [generating, setGenerating] = useState(false);
  const [llmStatus, setLlmStatus] = useState<null | { fellBack: boolean; provider: string; reason?: string }>(null);

  // 把用户的 LLM 配置接进 orchestrator 的增强钩子（A5 反馈语义 + A3 图像生成）。
  // 在 render 期同步设置（幂等），保证 applyFeedbackSmart/generateKeyboardBg 能用到最新配置。
  const registry = buildRegistry(modelConfigs);
  const extraBody = activeExtraBody(modelConfigs);
  const llmRef = activeRef(modelConfigs);
  if (registry) {
    orch.llm = {
      understandFeedback: async (text) => {
        const r = await understandFeedback(text, registry, llmRef, { extraBody });
        return r.data ? { type: r.data.type, direction: r.data.direction, target: r.data.target } : null;
      },
      generateKeyboardBg: async (brief) => {
        try {
          const cfg = registry.resolve(llmRef);
          const img = await generateImage(cfg, { prompt: skinImagePrompt({ styleKeywords: brief.styleKeywords, mood: brief.mood, primary: brief.palette.primary, material: brief.materialDirection }) });
          return img.bytes;
        } catch {
          return null;
        }
      },
    };
  } else {
    orch.llm = undefined;
  }
  const [compareMode, setCompareMode] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** 深浅双模式预览（FR-QA-3）：auto=设计原生主题；light/dark=强制预览对应变体。 */
  const [themeMode, setThemeMode] = useState<"auto" | "light" | "dark">("auto");
  /** 对话流（右侧聊天栏）：意图输入与反馈共用一条消息流。 */
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  /** 侧边对话栏：显示/隐藏 + 可拖宽度（px）。 */
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(340);
  const chatDrag = useRef<{ startX: number; startW: number } | null>(null);

  // —— 设置中心 + 快捷键 ——
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCat, setSettingsCat] = useState("general");
  const [menuOpen, setMenuOpen] = useState(false);
  const { combos, setCombo } = useShortcutCombos();
  useGlobalShortcut(combos, {
    "toggle-chat": () => setChatOpen((o) => !o),
    "open-settings": () => setSettingsOpen((o) => !o),
    "switch-model": () => { setSettingsCat("models"); setSettingsOpen(true); },
    "reset-project": () => reset(),
  });
  const onModelConfigsChange = (mc: ModelConfigs) => { setModelConfigs(mc); saveConfigs(mc); };
  /** 多机型 DPI 档位（FR-PREVIEW-7）：sd=标清(~160dpi) / hd=高清(~320dpi) / uhd=超高清(~480dpi)。 */
  const [dpi, setDpi] = useState<"sd" | "hd" | "uhd">("hd");
  /** 点选反馈（FR-FEEDBACK-5）：点选预览里的元素 + 自然语言。 */
  const [pickedEl, setPickedEl] = useState<PickedElement | null>(null);
  /**
   * 试打/标注模式分离（UX-002）：默认试打——预览内点击就是真实输入，点选层不渲染、
   * 零拦截；开启标注模式后渲染 pick-zone 覆盖层，点击即选反馈目标（移动端友好，
   * 不依赖右键/Alt）。Alt+点击/右键点选在两种模式下始终可用。
   */
  const [pickMode, setPickMode] = useState(false);
  /** 同项目偏好（FR-LEARN-1）：从反馈日志沉淀的可读偏好，仅本项目，可查看/清除。 */
  const [prefs, setPrefs] = useState<string[]>([]);
  /** 参考素材（FR-INPUT-1）：已处理的参考图/视频关键帧，随想法一起送多模态理解。 */
  const [refMedia, setRefMedia] = useState<RefMedia[]>([]);
  const [refError, setRefError] = useState<string | null>(null);
  const [refBusy, setRefBusy] = useState(false);
  const refInputRef = useRef<HTMLInputElement | null>(null);
  /** 语音输入（FR-INPUT-4）：转写写入想法框/反馈框，提交前可编辑。 */
  const [micTarget, setMicTarget] = useState<"idea" | "feedback" | null>(null);
  const micBaseRef = useRef(""); // 录音开始时输入框已有文本（转写追加其后）
  const speech = useSpeech((finalText, interim) => {
    const text = micBaseRef.current + finalText + interim;
    if (micTarget === "feedback") setFeedback(text);
    else setIdea(text);
  });

  /** 开始/停止某个输入框的语音听写。 */
  const toggleMic = (target: "idea" | "feedback") => {
    if (speech.listening && micTarget === target) {
      speech.stop();
      setMicTarget(null);
      return;
    }
    if (speech.listening) speech.stop();
    micBaseRef.current = target === "feedback" ? feedback : idea;
    setMicTarget(target);
    speech.start();
  };

  /** 选择参考图/视频文件 → 浏览器内处理（降采样/抽关键帧）。 */
  const onRefFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setRefError(null);
    setRefBusy(true);
    try {
      for (const file of Array.from(files)) {
        const media = await processRefFile(file);
        setRefMedia((cur) => [...cur, media]);
      }
    } catch (e) {
      setRefError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefBusy(false);
      if (refInputRef.current) refInputRef.current.value = "";
    }
  };

  const versions = orch.store.listVersions(project.id);
  // 当前预览皮肤：随 themeMode 切换主版本/派生变体（FR-QA-3 双模式）。导出/标题也用它，保证所见即所得。
  const skin: SkinManifest = ((): SkinManifest => {
    const d = orch.readDesign(currentId);
    if (themeMode === "auto" || !d.variant) return d.skin;
    return d.spec.theme === themeMode ? d.skin : d.variant.skin;
  })();
  // 导出面板的一键修复（FR-EXPORT-2）：当前预览皮肤的可读性 error 项（可据此给"一键修复"）。
  const qaErrors = orch.readDesign(currentId).qa.issues.filter((i) => i.severity === "error");

  // 每次变更后落盘。**从 bootRef.current 实时读取 orch/project**，而非渲染期捕获的闭包，
  // 否则 reset() 换掉 bootRef 后仍会把旧 store 快照写回，导致被清历史在刷新后复活。
  const persist = (cid: string) => {
    const b = bootRef.current!;
    saveState({ store: b.orch.store.snapshot(), projectId: b.project.id, projectName: b.project.name, currentId: cid });
  };

  const select = (id: string) => {
    setCurrentId(id);
    setEcho(null);
    persist(id);
  };

  const genFromBrief = (brief: DesignBrief, name: string) => {
    idSeq += 1;
    const g = orch.generate(project.id, brief, { id: `skin-${idSeq}`, name });
    setCurrentId(g.version.id);
    setEcho(null);
    refresh();
    persist(g.version.id);
  };

  // —— A1 意图理解前端闭环：想法 → （可选）追问 → Brief 确认 → 生成 ——

  /**
   * 降级链的参考图保底（FR-INPUT-1 AC2）：LLM 不可用/失败时，用 canvas 确定性提取
   * 首帧的主色/点缀色/背景色合并进 brief，并把这些字段标注为推断（诚实降级）。
   */
  const mergeRefColors = async (brief: DesignBrief, inferred: string[]): Promise<{ brief: DesignBrief; inferred: string[] }> => {
    const first = refMedia[0]?.frames[0];
    if (!first) return { brief, inferred };
    // 文字与图片冲突以文字为准：用户文字已明确指定主色（不在推断列表）则不覆盖
    if (!inferred.includes("palette.primary")) return { brief, inferred };
    try {
      const c = await extractColors(first);
      const merged: DesignBrief = { ...brief, palette: { primary: c.primary, accent: c.accent, background: c.background } };
      return { brief: merged, inferred };
    } catch {
      return { brief, inferred }; // 图像解码失败不阻断文字链路
    }
  };

  /** 第 1 步：分析想法。配了 LLM 则 LLM 增强（失败自动降级确定性）；否则确定性。需追问进 clarify，否则进 confirm。 */
  const onGenerate = async () => {
    const text = idea.trim();
    if (!text) return;
    if (speech.listening) { speech.stop(); setMicTarget(null); }
    const images = refMedia.flatMap((m) => m.frames);
    pushChat("user", refMedia.length > 0 ? `${text}（附 ${refMedia.map((m) => m.name).join("、")}）` : text); // 意图入对话流
    setIdea("");
    const reg = buildRegistry(modelConfigs);
    if (reg) {
      setGenerating(true);
      try {
        const r = await understandIntent(text, reg, activeRef(modelConfigs), { images: images.length > 0 ? images : undefined, extraBody: activeExtraBody(modelConfigs) });
        setLlmStatus({ fellBack: r.fellBack, provider: r.provenance.provider, reason: r.provenance.reason });
        const det = analyzeIntent(text);
        // LLM 降级且带参考图 → canvas 主色保底
        const fb = r.fellBack ? await mergeRefColors(r.data, det.inferredFields) : { brief: r.data, inferred: [] as string[] };
        setDraft({ brief: fb.brief, inferredFields: fb.inferred, question: det.question });
        setPhase(r.fellBack && det.needsClarification ? "clarify" : "confirm");
      } finally {
        setGenerating(false);
      }
    } else {
      setLlmStatus(null);
      const r = analyzeIntent(text);
      const fb = await mergeRefColors(r.brief, r.inferredFields);
      setDraft({ brief: fb.brief, inferredFields: fb.inferred, question: r.question });
      setPhase(r.needsClarification ? "clarify" : "confirm");
    }
  };

  /** 追问：选定/输入一个答案 → 进确认。 */
  const answerClarify = (answer: string) => {
    if (!draft?.question) return;
    const brief2 = refineBrief(draft.brief, draft.question.field, answer);
    const inferred = draft.inferredFields.filter((f) => f !== fieldKeyOf(draft.question!.field));
    setDraft({ brief: brief2, inferredFields: inferred });
    setPhase("confirm");
  };

  /** 追问：跳过（"你看着办"）→ 保留推断标注，直接进确认。 */
  const skipClarify = () => {
    setPhase("confirm");
  };

  /** 确认卡片：编辑某字段（编辑后该字段转为"用户明确指定"，去掉推断标注）。 */
  const editBrief = (patch: Partial<DesignBrief>, editedField?: string) => {
    if (!draft) return;
    const brief2 = { ...draft.brief, ...patch };
    const inferred = editedField ? draft.inferredFields.filter((f) => f !== editedField) : draft.inferredFields;
    setDraft({ ...draft, brief: brief2, inferredFields: inferred });
  };

  /** 确认生成：finalize（写入 inferredFields）→ 生成 → 回 idle（清掉已消费的参考素材）。 */
  const confirmGenerate = () => {
    if (!draft) return;
    const final = finalizeBrief(draft.brief, draft.inferredFields);
    const name = final.styleKeywords[0] ?? "自定义";
    genFromBrief(final, name);
    pushChat("sys", `已生成「${name}」新版本`);
    setPhase("idle");
    setDraft(null);
    setIdea("");
    setRefMedia([]);
  };

  // —— FR-LEARN-1 同项目偏好学习 ——

  /** 从一句反馈提炼一条可读偏好（如有可学信号）。 */
  const learnPref = (text: string) => {
    const rules: Array<{ re: RegExp; pref: string }> = [
      { re: /太深|偏深|颜色深/, pref: "偏好更浅的配色" },
      { re: /太浅|太亮|偏浅|偏亮/, pref: "偏好更深的配色" },
      { re: /稳重点|稳重|沉稳|成熟|太活泼|太花哨/, pref: "偏好稳重风格" },
      { re: /活泼|生动|有活力|太严肃|太沉闷/, pref: "偏好活泼风格" },
      { re: /简约|极简|干净|太复杂|太花/, pref: "偏好简约风格" },
      { re: /字太小|字小|偏小/, pref: "偏好更大字号" },
      { re: /字太大|字大|偏大/, pref: "偏好更小字号" },
    ];
    const learned = rules.filter((r) => r.re.test(text)).map((r) => r.pref);
    if (learned.length === 0) return;
    setPrefs((cur) => {
      const next = [...cur];
      for (const p of learned) if (!next.includes(p)) next.push(p);
      return next;
    });
  };

  const clearPrefs = () => setPrefs([]);

  const cancelIntent = () => {
    setPhase("idle");
    setDraft(null);
  };

  const submitFeedback = async () => {
    const text = feedback.trim();
    setFbError(null);
    // UX-004 AC：空输入不静默返回，给字段级提示（不产生版本、不入对话流）。
    if (!text) {
      setFbEmptyHint(true);
      return;
    }
    // UX-004 AC：提交进行中忽略重复发送（连点/回车只产生一个 fork）。ref 守卫同步生效，
    // 不受同一事件批内 state 过期闭包影响。
    if (fbBusyRef.current) return;
    fbBusyRef.current = true;
    setFbEmptyHint(false);
    if (speech.listening) { speech.stop(); setMicTarget(null); }
    // FR-FEEDBACK-5：点选元素时把目标词前置，让定向修改命中正确字段（一次一处）。
    const effective = pickedEl ? `${pickedEl.token}${/^的/.test(text) ? "" : "的"}${text}` : text;
    // 对话流：用户消息入流（点选则标注目标元素）
    pushChat("user", pickedEl ? `【${pickedEl.label}】${text}` : text);
    setFbBusy(true);
    try {
      // A5 LLM 增强：配了模型则用 understandFeedback 语义增强（失败自动走确定性）。
      const fb = await orch.applyFeedbackSmart(currentId, effective);
      setCurrentId(fb.version.id);
      const echoObj = { type: fb.classification.type, scope: fb.route.scope, passed: fb.design.qa.passed, picked: pickedEl?.label };
      setEcho(echoObj);
      pushChat("sys", `已听懂「${FB_LABEL[echoObj.type] ?? echoObj.type}」${echoObj.picked ? `（针对 ${echoObj.picked}）` : ""} · 本版自检${echoObj.passed ? "通过" : "有问题"}`);
      learnPref(effective); // FR-LEARN-1：沉淀同项目偏好
      setFeedback("");
      setPickedEl(null);
      persist(fb.version.id);
    } catch (err) {
      // UX-004 AC：异常不静默——输入与点选保留，用户可直接重试；不产生半成品版本。
      console.error("[feedback] 提交失败", err);
      setFbError("这条反馈处理失败了，输入已保留，请再点一次发送重试；若持续失败，可先重置对话再提。");
    } finally {
      fbBusyRef.current = false;
      setFbBusy(false);
      refresh();
    }
  };

  const chatSeq = useRef(0);
  const pushChat = (role: ChatMsg["role"], text: string) => {
    chatSeq.current += 1;
    setChatLog((log) => [...log, { id: chatSeq.current, role, text }]);
  };

  // 侧边栏拖拽调宽（左缘向左拖加宽）
  const onChatDragStart = (e: React.PointerEvent) => {
    chatDrag.current = { startX: e.clientX, startW: chatWidth };
    const onMove = (ev: PointerEvent) => {
      if (!chatDrag.current) return;
      const dx = chatDrag.current.startX - ev.clientX; // 向左拖 = 变宽
      setChatWidth(Math.max(260, Math.min(560, chatDrag.current.startW + dx)));
    };
    const onUp = () => {
      chatDrag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** 点选预览元素（在"试打区"以外的键盘/候选栏上点击即视为点选该元素反馈）。 */
  const onPickElement = (el: PickedElement) => {
    setPickedEl((cur) => (cur?.label === el.label ? null : el)); // 再点一次取消
  };

  /** FR-EXPORT-2 一键修复：按可读性 issue 的定位，给该元素"提亮一档"，作为一次常规版本节点进版本树。 */
  const fixContrast = (issueWhere: string) => {
    // 定位元素 → 提亮对应文字/填充一档（复用反馈定向修改机制，保证进版本树可回退）。
    const onCandidate = /候选/.test(issueWhere);
    const text = onCandidate ? "候选的颜色太深" : "按键的颜色太深";
    const fb = orch.applyFeedback(currentId, text);
    setCurrentId(fb.version.id);
    setEcho({ type: fb.classification.type, scope: fb.route.scope, passed: fb.design.qa.passed });
    refresh();
    persist(fb.version.id);
  };

  // 清空所有版本，从新的初始项目重来（并清除本地存档）。
  const reset = () => {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(LS_KEY);
    } catch {
      /* 忽略 */
    }
    bootRef.current = freshBoot();
    setCurrentId(bootRef.current.currentId);
    setEcho(null);
    refresh();
    persist(bootRef.current.currentId);
  };

  const downloadBytes = (bytes: Uint8Array, filename: string) => {
    if (typeof URL === "undefined" || !URL.createObjectURL) return;
    const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 按当前平台×设备象限导出对应出口（四出口：搜狗PC .ssf / 搜狗Android .ssf / 百度PC .bps / 百度Android .bds）。
  // 真实位图/布局坐标待 A3 图像生成接入；当前产出结构正确、可打包的配置骨架。导出当前预览的深/浅模式（FR-QA-3）。
  const exportSkin = () => {
    const base = skin.name || "skin";
    const set = exportSkinBytes(currentId);
    if (platform === "sogou") {
      if (device === "pc") {
        downloadBytes(set.sogouPc, `${base}-sogou-pc.ssf`);
      } else {
        downloadBytes(set.sogouMobile, `${base}-sogou-mobile.ssf`);
      }
    } else {
      if (device === "pc") {
        downloadBytes(set.baiduPc, `${base}-baidu-pc.bps`);
      } else {
        downloadBytes(set.baiduMobile, `${base}-baidu-mobile.bds`);
      }
    }
  };

  // 一键导出全部四个出口（搜狗PC / 搜狗Android / 百度PC / 百度Android）。导出当前预览的深/浅模式（FR-QA-3）。
  const exportAll = () => {
    const base = skin.name || "skin";
    const set = exportSkinBytes(currentId);
    downloadBytes(set.sogouPc, `${base}-sogou-pc.ssf`);
    downloadBytes(set.sogouMobile, `${base}-sogou-mobile.ssf`);
    downloadBytes(set.baiduPc, `${base}-baidu-pc.bps`);
    downloadBytes(set.baiduMobile, `${base}-baidu-mobile.bds`);
  };

  // —— FR-SHARE 分享与导回 ——

  /** 导出项目文件（JSON）：版本树完整还原，可跨设备导入继续编辑。 */
  const exportProject = () => {
    const b = bootRef.current!;
    const file: ProjectFile = {
      format: "imskin-project",
      version: 1,
      savedAt: new Date().toISOString(),
      store: b.orch.store.snapshot(),
      projectId: b.project.id,
      projectName: b.project.name,
      currentId,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(file, null, 2));
    downloadBytes(bytes, `${project.name || "imskin-project"}.imskin.json`);
  };

  /** 导入项目文件：校验 → 恢复版本树 → 落盘。失败明确提示（不静默产假状态）。 */
  const importProject = (fileText: string) => {
    const pf = parseProjectFile(fileText);
    if (!pf) {
      setImportError("导入失败：不是有效的 IMSkin 项目文件（或版本不兼容）");
      return false;
    }
    try {
      const orch2 = new SkinOrchestrator(ProjectStore.fromSnapshot(pf.store));
      const versions2 = orch2.store.listVersions(pf.projectId);
      if (versions2.length === 0 || !versions2.some((v) => v.id === pf.currentId)) {
        setImportError("导入失败：项目文件缺少有效版本");
        return false;
      }
      bootRef.current = { orch: orch2, project: { id: pf.projectId, name: pf.projectName }, currentId: pf.currentId };
      setCurrentId(pf.currentId);
      setEcho(null);
      setImportError(null);
      setPhase("idle");
      setDraft(null);
      refresh();
      persist(pf.currentId);
      return true;
    } catch {
      setImportError("导入失败：项目数据损坏");
      return false;
    }
  };

  /** 触发隐藏的文件选择。 */
  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importProject(String(reader.result ?? ""));
    reader.readAsText(f);
    e.target.value = ""; // 允许重复导入同一文件
  };

  /** 取某版本当前模式（深/浅）的皮肤：themeMode="auto" 用主版本，否则用派生变体。 */
  const skinOf = (versionId: string): SkinManifest => {
    const d = orch.readDesign(versionId);
    if (themeMode === "auto" || !d.variant) return d.skin;
    return d.spec.theme === themeMode ? d.skin : d.variant.skin;
  };

  /** 导出当前预览模式（深/浅）皮肤的四出口包（FR-QA-3：所见即所得，导出即当前预览模式）。 */
  const exportSkinBytes = (versionId: string) => {
    const target = skinOf(versionId);
    return orch.exportSkinSet(versionId, { skin: target });
  };

  /** 点选反馈包装：细粒度元素点选（FR-FEEDBACK-5 增强）。
   *  把预览划成多个可点选区：候选词 / 选中候选 / 拼音串 / 字母键 / 功能键 / 键盘背景 / 候选栏背景。
   *  点选哪块就只改哪块（token 注入反馈文本命中定向修改字段）。
   *  UX-002：覆盖层仅在「标注模式」渲染——试打模式下预览内点击全部交给真实输入。 */
  const withPick = (node: React.ReactNode) => {
    const zones: Array<{ key: keyof typeof PICKABLE; cls: string }> = [
      { key: "candidate-bg", cls: "pz-cand-bg" },
      { key: "composing", cls: "pz-composing" },
      { key: "candidate-selected", cls: "pz-cand-selected" },
      { key: "candidate", cls: "pz-cand" },
      { key: "keyboard-bg", cls: "pz-kb-bg" },
      { key: "key-special", cls: "pz-key-special" },
      { key: "key", cls: "pz-key" },
    ];
    return (
      <div className="pick-wrap" data-testid="pick-wrap">
        {node}
        {pickMode && zones.map(({ key, cls }) => {
          const el = PICKABLE[key];
          const picked = pickedEl?.label === el.label;
          return (
            <button
              key={key}
              type="button"
              className={`pick-zone ${cls}${picked ? " picked" : ""}`}
              onClick={() => onPickElement(el)}
              data-testid={`pick-${key}`}
              data-label={el.label}
              title={`点选「${el.label}」提反馈（只改这一块）`}
              aria-label={`点选${el.label}`}
            />
          );
        })}
      </div>
    );
  };

  // 渲染某个版本的预览（PC/手机），每个实例自带独立输入会话，可各自打字互不影响。
  // PRE-001：平台×设备组合成 Outlet 传入预览（领域枚举来自 @imskin/contracts）。
  const outlet = outletFromParts(platform, device === "pc" ? "pc" : "android") ?? "sogou_pc";
  const renderPreview = (versionId: string, suffix: string) => {
    const s = skinOf(versionId);
    return device === "mobile" ? (
      <MobileFrame dpi={dpi}>
        <PreviewRuntime
          key={`${versionId}-${platform}-${themeMode}-${dpi}-${suffix}`}
          skin={s}
          device="mobile"
          outlet={outlet}
          soundEnabled={sound}
          initialMode="t9" // 移动端默认九宫格 T9
          onPickElement={onPickElement}
          pickedLabel={pickedEl?.label ?? null}
        />
      </MobileFrame>
    ) : (
      <PreviewRuntime
        key={`${versionId}-${platform}-${themeMode}-${suffix}`}
        skin={s}
        device="pc"
        outlet={outlet}
        onPickElement={onPickElement}
        pickedLabel={pickedEl?.label ?? null}
      />
    );
  };

  // 开启对比时，默认对比对象取当前版本的父版本（天然形成"改之前 vs 改之后"）。
  const toggleCompare = () => {
    if (!compareMode) {
      const line = orch.lineage(currentId);
      const parent = line.length >= 2 ? line[line.length - 2].id : versions.find((v) => v.id !== currentId)?.id ?? currentId;
      setCompareId(parent);
    }
    setCompareMode((m) => !m);
  };

  const labelOf = (id: string) => versions.find((v) => v.id === id)?.label ?? id;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">IM<em>Skin</em></span>
          <span className="brand-sub">输入法皮肤工作台</span>
        </div>
        <span className="brand-project">{project.name}</span>
        <div className="skin-picker">
          {EXAMPLE_BRIEFS.map((ex) => (
            <button key={ex.id} type="button" className="skin-chip" onClick={() => genFromBrief(ex.brief, ex.name)}>
              <span className="skin-name">{ex.name}</span>
              <span className="skin-mood">从意图生成</span>
            </button>
          ))}
          <span className={`model-dot${activeConfig(modelConfigs) ? " on" : ""}`} title={activeConfig(modelConfigs) ? `已接模型 ${activeConfig(modelConfigs)!.model}` : "内置确定性理解"}>
            {activeConfig(modelConfigs) ? activeConfig(modelConfigs)!.model : "内置"}
          </span>
          <Tooltip label="重置项目" combo={combos["reset-project"] || null}>
            <button
              type="button"
              className="icon-btn"
              onClick={reset}
              aria-label="重置"
              data-testid="reset-btn"
            >
              <ResetIcon />
            </button>
          </Tooltip>
          <Tooltip label={chatOpen ? "隐藏对话栏" : "显示对话栏"} combo={combos["toggle-chat"]}>
            <button
              type="button"
              className={`icon-btn${chatOpen ? " active" : ""}`}
              onClick={() => setChatOpen((o) => !o)}
              aria-label={chatOpen ? "隐藏对话栏" : "显示对话栏"}
              aria-pressed={chatOpen}
              data-testid="chat-toggle"
            >
              <PanelIcon on={chatOpen} />
            </button>
          </Tooltip>
        </div>
      </header>

      <div className="workbench">
        {/* FR-LEARN-1：同项目偏好（可读摘要 + 可清除） */}
        {prefs.length > 0 && (
          <div className="prefs-banner" data-testid="prefs-banner">
            <span className="prefs-label">已学到的偏好（本项目）：</span>
            {prefs.map((p) => (
              <span key={p} className="pref-chip">{p}</span>
            ))}
            <button type="button" className="link-btn" onClick={clearPrefs}>清除</button>
          </div>
        )}

        <div className="workbench-body">
          {/* 左：版本时间线（版本树） */}
          <aside className="version-rail" data-testid="version-rail">
            <div className="rail-title">版本树</div>
            <div className="rail-share">
              <button type="button" className="share-btn" onClick={exportProject} data-action="export-project" title="导出项目文件（版本树+设计数据），可跨设备导入继续编辑（FR-SHARE-1）">
                导出项目
              </button>
              <button type="button" className="share-btn" onClick={triggerImport} data-action="import-project" title="导入 IMSkin 项目文件，恢复完整版本树继续编辑">
                导入项目
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={onImportFile}
                data-testid="import-file-input"
              />
            </div>
            {importError && (
              <div className="import-error" data-testid="import-error" role="alert">
                {importError}
              </div>
            )}
            {layoutVersionTree(versions).map((row) => {
              const vv = row.version;
              return (
                <button
                  key={vv.id}
                  type="button"
                  className={`version-item${vv.id === currentId ? " active" : ""}`}
                  onClick={() => select(vv.id)}
                >
                  {row.depth > 0 && <span className="v-tree">{rowPrefix(row)}</span>}
                  <span className="v-label">{vv.label ?? vv.id}</span>
                  <span className={`v-status s-${vv.status}`}>{vv.status}</span>
                </button>
              );
            })}
          </aside>

          {/* 中央：预览舞台 */}
          <div className="stage-col">
            <div className="stage-toolbar">
              <div className="seg" role="tablist" aria-label="预览目标平台">
                <span className="seg-label">平台</span>
                <button type="button" className={`tab${platform === "sogou" ? " active" : ""}`} onClick={() => setPlatform("sogou")}>搜狗</button>
                <button type="button" className={`tab${platform === "baidu" ? " active" : ""}`} onClick={() => setPlatform("baidu")}>百度</button>
              </div>
              <div className="seg" aria-label="预览设备">
                <span className="seg-label">设备</span>
                <button type="button" className={`tab${device === "pc" ? " active" : ""}`} onClick={() => setDevice("pc")}>PC</button>
                <button type="button" className={`tab${device === "mobile" ? " active" : ""}`} onClick={() => setDevice("mobile")}>手机</button>
              </div>
              <div className="seg" role="tablist" aria-label="深浅模式">
                <span className="seg-label">模式</span>
                <button type="button" className={`tab${themeMode === "auto" ? " active" : ""}`} onClick={() => setThemeMode("auto")} title="设计原生主题">默认</button>
                <button type="button" className={`tab${themeMode === "light" ? " active" : ""}`} onClick={() => setThemeMode("light")} title="浅色模式（FR-QA-3 双模式）">浅色</button>
                <button type="button" className={`tab${themeMode === "dark" ? " active" : ""}`} onClick={() => setThemeMode("dark")} title="深色模式（FR-QA-3 双模式）">深色</button>
              </div>
              {device === "mobile" && (
                <div className="seg" role="tablist" aria-label="屏幕密度档位">
                  <span className="seg-label">DPI</span>
                  <button type="button" className={`tab${dpi === "sd" ? " active" : ""}`} onClick={() => setDpi("sd")} title="标清 ~160dpi（低密度老机型）">标清</button>
                  <button type="button" className={`tab${dpi === "hd" ? " active" : ""}`} onClick={() => setDpi("hd")} title="高清 ~320dpi（主流机型）">高清</button>
                  <button type="button" className={`tab${dpi === "uhd" ? " active" : ""}`} onClick={() => setDpi("uhd")} title="超高清 ~480dpi（高密度旗舰，易发虚）">超清</button>
                </div>
              )}
              {device === "mobile" && (
                <label className="sound-toggle" title="按键音（需浏览器支持 Web Audio；真机触感更强）">
                  <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> 按键音
                </label>
              )}
              <div className="toolbar-spacer" />
              <button
                type="button"
                className={`export-btn${pickMode ? " active" : ""}`}
                onClick={() => setPickMode((m) => !m)}
                aria-pressed={pickMode}
                data-testid="pick-mode-toggle"
                title="标注模式：点击预览里的元素选择反馈目标（移动端也可用）；关闭后恢复真实试打"
              >
                {pickMode ? "退出标注" : "标注反馈"}
              </button>
              <button
                type="button"
                className={`export-btn${compareMode ? " active" : ""}`}
                onClick={toggleCompare}
                title="并排对比两个版本（人在比较中做判断，§6.2）"
              >
                {compareMode ? "退出对比" : "并排对比"}
              </button>
              <button
                type="button"
                className="export-btn"
                onClick={exportSkin}
                title={
                  platform === "sogou"
                    ? device === "pc"
                      ? "导出搜狗 PC .ssf（skin.ini 字段经 ssfconv/真实样本逆向确证，UTF-16；真机安装待验证）"
                      : "导出搜狗 Android .ssf（普通 zip，phoneTheme.ini+theme/layout；结构经真实 APK 逆向确证）"
                    : device === "pc"
                      ? "导出百度 PC .bps（skin.ini+Skin.xml+Candidate/Status；结构经真实皮肤解包确证；真机安装待验证）"
                      : "导出百度 Android .bds（Info.txt+Token.txt+port/land+css.ini；结构经真实 APK 逆向确证）"
                }
              >
                导出 {platform === "sogou"
                  ? device === "pc" ? ".ssf" : "移动 .ssf"
                  : device === "pc" ? ".bps" : "移动 .bds"}
              </button>
              <button
                type="button"
                className="export-btn export-all"
                onClick={exportAll}
                title="一键导出全部四个出口（搜狗PC/搜狗Android/百度PC/百度Android）"
              >
                导出全部
              </button>
            </div>

            {/* FR-EXPORT-2：导出前的可读性一键修复（只列 error；修复作为版本节点可回退） */}
            {qaErrors.length > 0 && (
              <div className="qa-fix-bar" data-testid="qa-fix-bar">
                <span className="qa-fix-label">可读性提醒</span>
                {qaErrors.map((iss, i) => (
                  <span key={i} className="qa-fix-item">
                    {iss.where ?? iss.message}
                    <button type="button" className="qa-fix-btn" onClick={() => fixContrast(iss.where ?? "")} data-testid={`fix-${i}`}>
                      一键修复
                    </button>
                  </span>
                ))}
              </div>
            )}

            {compareMode ? (
              <div className="compare-row" data-testid="compare-row">
                <div className="compare-pane">
                  <div className="pane-title">
                    <select value={compareId ?? ""} onChange={(e) => setCompareId(e.target.value)} aria-label="对比版本">
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>{v.label ?? v.id}</option>
                      ))}
                    </select>
                  </div>
                  {compareId && renderPreview(compareId, "a")}
                </div>
                <div className="compare-pane">
                  <div className="pane-title current">当前：{labelOf(currentId)}</div>
                  {renderPreview(currentId, "b")}
                </div>
              </div>
            ) : (
              <div className={`stage-wrap${device === "mobile" ? " mobile" : ""}`}>
                {pickMode && (
                  <div className="pick-mode-hint" data-testid="pick-mode-hint">
                    标注模式：点击预览里的元素选择反馈目标（物理键盘仍可打字；右键/Alt 点选不受影响）
                  </div>
                )}
                {withPick(renderPreview(currentId, "single"))}
              </div>
            )}
          </div>

          {/* 右：对话栏（可显示/隐藏 + 可拖宽） */}
          {chatOpen && (
            <aside className="chat-rail" data-testid="chat-rail" style={{ width: chatWidth }}>
              {/* 左缘拖拽手柄 */}
              <div className="chat-resizer" onPointerDown={onChatDragStart} title="左右拖动调整宽度" data-testid="chat-resizer" />
              <div className="chat-head">
                <span className="chat-head-icon" aria-hidden>💬</span>
                <span className="chat-head-title">对话</span>
              </div>

              {/* 消息流 */}
              <div className="chat-log" data-testid="chat-log">
                {chatLog.length === 0 && (
                  <div className="chat-empty">在下方输入想法生成皮肤，或点选预览里的键盘/候选栏后提意见。</div>
                )}
                {chatLog.map((m) => (
                  <div key={m.id} className={`chat-msg ${m.role}`}>
                    {m.role === "sys" && <span className="chat-avatar" aria-hidden>✦</span>}
                    <span className="chat-bubble">{m.text}</span>
                  </div>
                ))}
                {echo && (
                  <div className="feedback-echo" data-testid="feedback-echo">
                    已听懂：<b>{FB_LABEL[echo.type] ?? echo.type}</b>{echo.picked ? <>（针对 <b>{echo.picked}</b>）</> : null} · {echo.scope} · 本版自检{echo.passed ? "通过" : "有问题"}
                  </div>
                )}
              </div>

              {/* 追问卡片（一次一个） */}
              {phase === "clarify" && draft?.question && (
                <div className="clarify-card" data-testid="clarify-card">
                  <div className="clarify-q">{draft.question.text}</div>
                  <div className="clarify-options">
                    {draft.question.options.map((opt) => (
                      <button key={opt} type="button" className="preset-chip" onClick={() => answerClarify(opt)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  <div className="clarify-actions">
                    <button type="button" className="link-btn" onClick={skipClarify}>你看着办</button>
                    <button type="button" className="link-btn" onClick={cancelIntent}>取消</button>
                  </div>
                </div>
              )}

              {/* Brief 确认卡片 */}
              {phase === "confirm" && draft && (
                <div className="brief-card" data-testid="brief-card">
                  <div className="brief-title">
                    确认设计简报
                    {draft.inferredFields.length > 0 && <span className="brief-hint">（高亮为推断，可改）</span>}
                  </div>
                  <div className="brief-fields">
                    <BriefField label="风格关键词" inferred={draft.inferredFields.includes("styleKeywords")} value={draft.brief.styleKeywords.join("、")} onEdit={(v) => editBrief({ styleKeywords: v.split(/[，,、\s]+/).filter(Boolean) }, "styleKeywords")} />
                    <BriefColorField inferred={draft.inferredFields.includes("palette.primary")} value={draft.brief.palette.primary} onEdit={(v) => editBrief({ palette: { ...draft.brief.palette, primary: v } }, "palette.primary")} />
                    <BriefField label="情绪" inferred={draft.inferredFields.includes("mood")} value={draft.brief.mood ?? ""} onEdit={(v) => editBrief({ mood: v }, "mood")} />
                    <BriefCornerField inferred={draft.inferredFields.includes("cornerRadius")} value={draft.brief.cornerRadius ?? "medium"} onEdit={(v) => editBrief({ cornerRadius: v }, "cornerRadius")} />
                  </div>
                  <div className="brief-actions">
                    <button type="button" className="gen-btn" onClick={confirmGenerate} data-testid="confirm-generate">确认生成</button>
                    <button type="button" className="link-btn" onClick={cancelIntent}>返回修改</button>
                  </div>
                </div>
              )}

              {/* 输入区：意图 + 反馈 合一 */}
              <div className="chat-input">
                {pickedEl && (
                  <div className="picked-hint" data-testid="picked-hint">
                    已点选 <b>{pickedEl.label}</b> —— 这次反馈只改这一块
                    <button type="button" className="link-btn" onClick={() => setPickedEl(null)}>取消</button>
                  </div>
                )}
                {llmStatus && (
                  <div className={`llm-status${llmStatus.fellBack ? " fellback" : ""}`} data-testid="llm-status">
                    {llmStatus.fellBack ? `模型未生效，已用内置理解` : `已用你的模型 ${llmStatus.provider} 理解`}
                  </div>
                )}
                {/* 参考素材（FR-INPUT-1）：已选图/视频关键帧 chip；处理失败/格式不支持给提示 */}
                {(refMedia.length > 0 || refError || refBusy) && (
                  <div className="ref-media" data-testid="ref-media">
                    {refMedia.map((m, i) => (
                      <span className="ref-chip" key={`${m.name}-${i}`} data-testid="ref-chip">
                        <img src={m.frames[0]} alt={m.name} />
                        <span className="ref-chip-name">{m.kind === "video" ? `${m.name}（${m.frames.length} 关键帧）` : m.name}</span>
                        <button type="button" className="ref-chip-x" aria-label={`移除 ${m.name}`} onClick={() => setRefMedia((cur) => cur.filter((_, j) => j !== i))}>×</button>
                      </span>
                    ))}
                    {refBusy && <span className="ref-busy">处理素材中…</span>}
                    {refError && <span className="ref-error" data-testid="ref-error">{refError}</span>}
                  </div>
                )}
                {/* 语音识别错误（FR-INPUT-4 AC3）：权限拒绝/不支持 → 明确提示退回文字输入 */}
                {speech.error && (
                  <div className="mic-error" data-testid="mic-error">{speech.error}</div>
                )}
                <div className="chat-input-row">
                  <input
                    ref={refInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => onRefFiles(e.target.files)}
                    data-testid="ref-file-input"
                  />
                  <Tooltip label="上传参考图/视频（可选）">
                    <button type="button" className="icon-btn" onClick={() => refInputRef.current?.click()} disabled={refBusy} data-testid="ref-upload-btn" aria-label="上传参考图或视频">📎</button>
                  </Tooltip>
                  <input
                    className="idea-input"
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && phase === "idle" && !generating && onGenerate()}
                    placeholder="描述想法，如：清冷极简、水墨留白"
                    data-testid="idea-input"
                  />
                  <Tooltip label={speech.supported ? (speech.listening && micTarget === "idea" ? "停止听写" : "语音说出想法") : "当前浏览器不支持语音输入，请打字"}>
                    <button
                      type="button"
                      className={`icon-btn mic-btn${speech.listening && micTarget === "idea" ? " on" : ""}`}
                      onClick={() => toggleMic("idea")}
                      disabled={!speech.supported}
                      data-testid="mic-idea-btn"
                      aria-label="语音输入想法"
                    >🎤</button>
                  </Tooltip>
                  <button type="button" className="gen-btn" onClick={onGenerate} disabled={phase !== "idle" || generating} data-testid="generate-btn">
                    {generating ? "生成中…" : "生成"}
                  </button>
                </div>
                <div className="chat-input-row">
                  <input
                    value={feedback}
                    onChange={(e) => {
                      setFeedback(e.target.value);
                      if (fbEmptyHint) setFbEmptyHint(false);
                      if (fbError) setFbError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && !fbBusy && submitFeedback()}
                    placeholder={pickedEl ? `说说「${pickedEl.label}」哪里不对` : "提意见迭代，如「候选词字太小」"}
                    aria-invalid={fbEmptyHint || !!fbError}
                    data-testid="feedback-input"
                  />
                  <Tooltip label={speech.supported ? (speech.listening && micTarget === "feedback" ? "停止听写" : "语音提意见") : "当前浏览器不支持语音输入，请打字"}>
                    <button
                      type="button"
                      className={`icon-btn mic-btn${speech.listening && micTarget === "feedback" ? " on" : ""}`}
                      onClick={() => toggleMic("feedback")}
                      disabled={!speech.supported}
                      data-testid="mic-feedback-btn"
                      aria-label="语音输入反馈"
                    >🎤</button>
                  </Tooltip>
                  <button type="button" className="gen-btn ghost" onClick={submitFeedback} disabled={fbBusy} aria-busy={fbBusy} data-testid="feedback-send">
                    {fbBusy ? "发送中…" : "发送"}
                  </button>
                </div>
                {(fbEmptyHint || fbError) && (
                  <div className="chat-field-error" role="alert" data-testid="feedback-field-error">
                    {fbEmptyHint ? "说点什么吧：描述要改哪里，如「候选词字太小」。" : fbError}
                  </div>
                )}
                <div className="chat-footer">
                  <ModelSwitcher
                    mc={modelConfigs}
                    onChange={onModelConfigsChange}
                    onOpenSettings={() => { setSettingsCat("models"); setSettingsOpen(true); }}
                    combo={combos["switch-model"]}
                  />
                  <span className="chat-qa">✔ 生成即自检</span>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* 左下角控制条：设置（⚙ + 标签，点上弹菜单）+ 帮助占位。钉在窗口左下，不随内容滚动。 */}
      <div className="corner-bar" data-testid="corner-bar">
        <div className="corner-settings">
          <Tooltip label="设置" combo={combos["open-settings"]} side="top">
            <button
              type="button"
              className="corner-item corner-gear"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="设置"
              data-testid="settings-menu-btn"
            >
              <GearIcon />
              <span className="corner-label">IMSkin</span>
            </button>
          </Tooltip>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="corner-menu" role="menu" data-testid="corner-menu">
                <div className="corner-menu-title">IMSkin</div>
                <button
                  type="button"
                  role="menuitem"
                  className="corner-menu-item"
                  onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}
                  data-testid="menu-open-settings"
                >
                  <span className="corner-menu-icon" aria-hidden>⚙️</span>
                  设置
                  {combos["open-settings"] ? <kbd className="kbd">{combos["open-settings"]}</kbd> : null}
                </button>
                {/* 扩展位：显示宠物 / 其他功能开关，后续迭代往里加 */}
              </div>
            </>
          )}
        </div>
        <Tooltip label="帮助与反馈（即将上线）" side="top" className="corner-help-tip">
          <button
            type="button"
            className="corner-item corner-help"
            onClick={() => pushChat("sys", "帮助与反馈入口即将上线。当前可在右侧对话栏输入想法或点选预览提意见。")}
            aria-label="帮助"
            data-testid="help-btn"
          >
            <HelpIcon />
          </button>
        </Tooltip>
      </div>

      {/* 设置中心（全屏覆盖） */}
      {settingsOpen && (
        <SettingsPage
          onBack={() => setSettingsOpen(false)}
          combos={combos}
          onSetCombo={setCombo}
          modelConfigs={modelConfigs}
          onModelConfigsChange={onModelConfigsChange}
          initialCat={settingsCat}
        />
      )}
    </div>
  );
}

// —— Brief 确认卡片字段组件（内联编辑 + 推断高亮）——

function InferredTag() {
  return <span className="inferred-tag">推断</span>;
}

function BriefField(props: { label: string; inferred: boolean; value: string; onEdit: (v: string) => void }) {
  return (
    <label className={`brief-field${props.inferred ? " inferred" : ""}`}>
      <span className="brief-label">
        {props.label}
        {props.inferred && <InferredTag />}
      </span>
      <input value={props.value} onChange={(e) => props.onEdit(e.target.value)} />
    </label>
  );
}

function BriefColorField(props: { inferred: boolean; value: string; onEdit: (v: string) => void }) {
  return (
    <label className={`brief-field${props.inferred ? " inferred" : ""}`}>
      <span className="brief-label">
        主色
        {props.inferred && <InferredTag />}
      </span>
      <span className="brief-color">
        <input type="color" value={props.value} onChange={(e) => props.onEdit(e.target.value)} />
        <span className="brief-color-hex">{props.value}</span>
      </span>
    </label>
  );
}

function BriefCornerField(props: { inferred: boolean; value: CornerPreference; onEdit: (v: CornerPreference) => void }) {
  return (
    <label className={`brief-field${props.inferred ? " inferred" : ""}`}>
      <span className="brief-label">
        圆角
        {props.inferred && <InferredTag />}
      </span>
      <select value={props.value} onChange={(e) => props.onEdit(e.target.value as CornerPreference)}>
        <option value="small">{CORNER_LABEL.small}</option>
        <option value="medium">{CORNER_LABEL.medium}</option>
        <option value="large">{CORNER_LABEL.large}</option>
      </select>
    </label>
  );
}
