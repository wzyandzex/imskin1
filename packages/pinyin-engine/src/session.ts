/**
 * 输入会话状态机 —— 把"敲键 + 选词"变成"上屏文本"的输入运行时。
 *
 * 这是引擎与虚拟键盘 UI 之间的桥：UI 只管把按键事件喂进来、把 view() 渲染出去；
 * 组合缓冲、候选翻页、选词消耗、退格、上屏、切换 26 键/九宫格等全部逻辑在此，纯函数式、
 * 可在 Node 里完备单测，不依赖浏览器。真实输入法的"手感"由这层的正确性决定。
 *
 * 约定：缓冲 `buffer` 只存可参与拼音的字符（26 键 a-z / 九宫格 2-9），因此候选覆盖的
 * 拼音字母数（candidate.letters）等于要从缓冲头部消耗的字符数（九宫格每字母对应 1 数字）。
 */

import {
  PinyinEngine,
  pinyinEngine,
  type Candidate,
  type InputMode,
} from "./engine.ts";

export interface SessionView {
  mode: InputMode;
  /** 已上屏文本（落地文本框内容）。 */
  committedText: string;
  /** 当前组合缓冲（原始敲入）。 */
  buffer: string;
  /** 拼音串展示：音节序列（如 ni'hao）。 */
  composing: string[];
  /** 尾部未成音节的残余（增量输入时展示；九宫格恒为空）。 */
  remainder: string;
  /** 当前页候选。 */
  candidates: Candidate[];
  page: number;
  hasMore: boolean;
  totalCandidates: number;
  /** 是否正在组合（缓冲非空）。 */
  composingActive: boolean;
}

export interface SessionOptions {
  engine?: PinyinEngine;
  mode?: InputMode;
  pageSize?: number;
}

export class InputSession {
  private engine: PinyinEngine;
  private _mode: InputMode;
  private readonly pageSize: number;

  private _committed = "";
  private _buffer = "";
  private _page = 0;

  constructor(opts: SessionOptions = {}) {
    this.engine = opts.engine ?? pinyinEngine;
    this._mode = opts.mode ?? "qwerty";
    this.pageSize = opts.pageSize ?? 9;
  }

  /** 该模式下某字符是否可进入缓冲。 */
  private accepts(ch: string): boolean {
    return this._mode === "t9" ? /^[2-9]$/.test(ch) : /^[a-z]$/.test(ch);
  }

  /** 敲入一个字符（大写自动转小写）。非本模式可接受的字符：若在组合中则忽略，否则直接上屏。 */
  input(ch: string): void {
    const c = ch.toLowerCase();
    if (this.accepts(c)) {
      this._buffer += c;
      this._page = 0;
      return;
    }
    // 非拼音字符：组合中忽略（避免脏输入），空闲时作为普通字符上屏（英文/符号直通）
    if (this._buffer === "") {
      this._committed += ch;
    }
  }

  /** 初始输入模式（新会话从何模式开始）。 */
  get initialMode(): InputMode {
    return this._mode;
  }

  /** 退格：优先删缓冲；缓冲空时删已上屏的最后一个字符。 */
  backspace(): void {
    if (this._buffer !== "") {
      this._buffer = this._buffer.slice(0, -1);
      this._page = 0;
      return;
    }
    if (this._committed !== "") {
      // 以 Unicode 码点为单位删除，避免切坏代理对（emoji 等）
      const cps = Array.from(this._committed);
      cps.pop();
      this._committed = cps.join("");
    }
  }

  /** 选择当前页第 idx 个候选（0 基）。数字键 1-9 选词即 idx=键-1。 */
  selectCandidate(idx: number): void {
    const view = this.view();
    const cand = view.candidates[idx];
    if (!cand) return;
    this._committed += cand.word;
    this._buffer = this._buffer.slice(cand.letters); // 消耗该候选覆盖的字符
    this._page = 0;
  }

  /** 上屏：有候选则上首选（并消耗其覆盖），否则把缓冲原样上屏（英文直通）。 */
  commit(): void {
    if (this._buffer === "") return;
    const view = this.view();
    if (view.candidates.length > 0) {
      this.selectCandidate(0);
    } else {
      this._committed += this._buffer;
      this._buffer = "";
      this._page = 0;
    }
  }

  /** 原样上屏当前缓冲（回车：直接把敲入的拼音字母/数字当文本上屏，不选候选）。 */
  commitRaw(): void {
    if (this._buffer === "") return;
    this._committed += this._buffer;
    this._buffer = "";
    this._page = 0;
  }

  /** 插入字面文本（标点/表情等）：若正在组合，先把整段组合逐次上屏，再追加文本。 */
  insertText(text: string): void {
    // 组合可能跨多个音节，commit 每次只消耗首选覆盖的部分；循环直到缓冲清空，
    // 避免标点被插到未完成组合之前（如 nihaoma 敲一半插「，」应得「…，」而非夹在词中）。
    while (this._buffer !== "") this.commit();
    this._committed += text;
  }

  /** 空格：组合中等于上屏首选；空闲时输入一个空格。 */
  space(): void {
    if (this._buffer !== "") this.commit();
    else this._committed += " ";
  }

  pageDown(): void {
    if (this.view().hasMore) this._page += 1;
  }

  pageUp(): void {
    if (this._page > 0) this._page -= 1;
  }

  /** 切换输入模式；清空当前未上屏的组合缓冲，避免 a-z 与 2-9 混淆。 */
  switchMode(mode: InputMode): void {
    if (mode === this._mode) return;
    this._mode = mode;
    this._buffer = "";
    this._page = 0;
  }

  /** 放弃当前组合缓冲（Esc）。 */
  clearComposing(): void {
    this._buffer = "";
    this._page = 0;
  }

  /** 清空全部（含已上屏文本）。 */
  reset(): void {
    this._committed = "";
    this._buffer = "";
    this._page = 0;
  }

  get mode(): InputMode {
    return this._mode;
  }

  /** 计算当前视图（供 UI 渲染）。 */
  view(): SessionView {
    const p = this.engine.page(this._buffer, this._mode, this._page, this.pageSize);
    return {
      mode: this._mode,
      committedText: this._committed,
      buffer: this._buffer,
      composing: p.segmentation,
      remainder: p.remainder,
      candidates: p.candidates,
      page: p.page,
      hasMore: p.hasMore,
      totalCandidates: p.totalCandidates,
      composingActive: this._buffer !== "",
    };
  }
}
