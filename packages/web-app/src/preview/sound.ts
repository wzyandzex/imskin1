/**
 * 按键音（移动端皮肤核心卖点之一，架构 §4.8）——用 Web Audio 合成短促"咔哒"声，无需音频资源。
 *
 * 稳健性：
 * - 浏览器自动播放策略要求 AudioContext 在**首次用户手势**里 resume，故 playClick 内做惰性 resume。
 * - 环境无 Web Audio（如 jsdom 测试、iOS 限制）时全部方法**静默 no-op**，绝不抛错破坏输入。
 * - 真机触感（振动）在多数浏览器/iOS 不可得，这里以音效近似，UI 侧应明示差异（不假装等价）。
 */

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class KeySound {
  private ctx: AudioContext | null = null;
  private _enabled = false;
  private readonly ctor: AudioCtor | null;

  constructor() {
    this.ctor = getAudioCtor();
  }

  /** 当前环境是否支持音效。 */
  get available(): boolean {
    return this.ctor !== null;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(on: boolean): void {
    this._enabled = on && this.available;
  }

  /** 播放一次按键音。variant 区分普通键/功能键，音高略不同。 */
  playClick(variant: "normal" | "special" = "normal"): void {
    if (!this._enabled || !this.ctor) return;
    try {
      if (!this.ctx) this.ctx = new this.ctor();
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(variant === "special" ? 320 : 440, now);
      // 极短促的包络，模拟机械"咔哒"
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // 任何音频异常都不应影响输入
      this._enabled = false;
    }
  }
}
